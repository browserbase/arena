"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ActionArgs, BrowserStep } from "@/app/types/ChatFeed";
import { AgentLog, UseAgentStreamProps, AgentStreamState, LogEvent } from "@/app/types/Agent";

// Global trackers to avoid duplicate session creation in React Strict Mode
// by sharing a single in-flight promise across mounts for the same goal.
const sessionCreationPromises = new Map<
  string,
  Promise<{ sessionId: string; sessionUrl: string | null; }>
>();

export function useAgentStreamGoogle({
  sessionId,
  goal,
  onStart,
  onDone,
  onError,
  provider = "google",
}: UseAgentStreamProps & { provider?: string }) {
  const [state, setState] = useState<AgentStreamState>({
    sessionId: sessionId,
    sessionUrl: null,
    steps: [],
    logs: [],
    isLoading: false,
    isFinished: false,
    error: null,
    invokedTools: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const stepCounterRef = useRef(1);
  const stepOffsetRef = useRef(0);
  const finalMessageAddedRef = useRef<string | null>(null);
  // Use refs for callbacks to avoid dependency issues
  const onStartRef = useRef(onStart);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onStartRef.current = onStart;
    onDoneRef.current = onDone;
    onErrorRef.current = onError;
  }, [onStart, onDone, onError]);

  // No need to reset session tracking anymore - using tracker system

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isFinished: true,
    }));
  }, []);

  const parseLog = useCallback((raw: string): AgentLog | null => {
    if (raw.startsWith("💭 ")) {
      return { kind: "thought", text: raw.slice(2).trim() };
    }
    const execMatch = raw.match(/^Executing step\s+(\d+)/i);
    if (execMatch) {
      return { kind: "summary", step: parseInt(execMatch[1], 10), text: "" };
    }
    // Function call lines, optionally without args, and possibly multi-line JSON
    const fnMatch = raw.match(/^Found function call:\s*([A-Za-z0-9_]+)(?:\s+with args:\s*([\s\S]+))?$/i);
    if (fnMatch) {
      let args: ActionArgs = { action: "" };
      const jsonText = (fnMatch[2] || "").trim();
      if (jsonText) {
        try {
          args = JSON.parse(jsonText);
        } catch {
          args = { action: jsonText };
        }
      }
      return { kind: "action", step: stepCounterRef.current, tool: fnMatch[1], args };
    }
    return null;
  }, []);

  const isPlainObject = useCallback((v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v), []);
  const isEmptyObject = useCallback((v: unknown) => isPlainObject(v) && Object.keys(v as Record<string, unknown>).length === 0, [isPlainObject]);

  useEffect(() => {
    if (!goal) {
      return;
    }

    let cancelled = false;

    const initializeStream = async () => {
      let currentSessionId = sessionId;

      // If no sessionId provided, create or reuse a session via shared promise
      if (!currentSessionId) {
        try {
          setState((prev) => ({ ...prev, isLoading: true, error: null }));

          let promise = sessionCreationPromises.get(goal);
          if (!promise) {
            promise = (async () => {
              const sessionResponse = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
              });

              const sessionData = await sessionResponse.json();
              if (!sessionData.success) {
                throw new Error(sessionData.error || "Failed to create session");
              }

              return {
                sessionId: sessionData.sessionId as string,
                sessionUrl: (sessionData.sessionUrl as string) ?? null,
              };
            })();
            sessionCreationPromises.set(goal, promise);
          }

          const result = await promise;
          if (cancelled) return;

          currentSessionId = result.sessionId;
          setState((prev) => ({
            ...prev,
            sessionId: result.sessionId,
            sessionUrl: result.sessionUrl,
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to create session";
          setState((prev) => ({ ...prev, error: errorMessage, isLoading: false }));
          onErrorRef.current?.(errorMessage);
          // Allow retries by clearing promise on error
          sessionCreationPromises.delete(goal);
          return;
        }
      }

      if (cancelled || !currentSessionId) return;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      // Create EventSource for SSE
      const params = new URLSearchParams({
        sessionId: currentSessionId!,
        goal,
      });

      const es = new EventSource(`/api/agent?${params.toString()}&provider=${provider}`);
      eventSourceRef.current = es;

      // Add event listeners
      es.addEventListener("start", (e) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse((e as MessageEvent).data);
          setState((prev) => ({
            ...prev,
            sessionId: payload.sessionId,
            isLoading: false,
          }));
          onStartRef.current?.(payload);
        } catch (err) {
          console.error("Error parsing start event:", err);
        }
      });

    es.addEventListener("log", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data) as LogEvent;
        const parsed = parseLog(payload.message);

        setState((prev) => {
          const newLogs = [...prev.logs, payload];
          if (!parsed) {
            return { ...prev, logs: newLogs };
          }

          if (parsed.kind === "summary") {
            // If the first visible step starts at >1 (because step 1 was hidden),
            // shift numbering so the first visible step is Step 1.
            if (stepOffsetRef.current === 0 && prev.steps.length === 0 && parsed.step > 1) {
              stepOffsetRef.current = parsed.step - 1;
            }
            const displayStep = Math.max(1, parsed.step - stepOffsetRef.current);
            stepCounterRef.current = displayStep;

            const trimmedText = (parsed.text || "").trim();

            // Update existing step with matching number if present; else append
            const existingIndex = prev.steps.findIndex((s) => s.stepNumber === displayStep);
            if (existingIndex >= 0) {
              const existing = prev.steps[existingIndex];
              const existingText = (existing.text || "").trim();
              // If text is identical, no change; otherwise update text/instruction
              if (trimmedText && trimmedText !== existingText) {
                const updated: BrowserStep = {
                  ...existing,
                  // Keep whatever tool it currently has (may have been upgraded to an action)
                  text: parsed.text,
                  instruction: parsed.text,
                };
                const newSteps = [...prev.steps];
                newSteps[existingIndex] = updated;
                return { ...prev, logs: newLogs, steps: newSteps };
              }
              return { ...prev, logs: newLogs };
            }

            const newStep: BrowserStep = {
              stepNumber: displayStep,
              text: parsed.text,
              reasoning: "",
              tool: "MESSAGE",
              instruction: parsed.text,
            };
            return { ...prev, logs: newLogs, steps: [...prev.steps, newStep] };
          }

          if (parsed.kind === "thought") {
            if (prev.steps.length === 0) {
              // create a placeholder step 1 to hold the thought
              const placeholder: BrowserStep = {
                stepNumber: stepCounterRef.current,
                text: "",
                reasoning: parsed.text,
                tool: "MESSAGE",
                instruction: "",
              };
              return { ...prev, logs: newLogs, steps: [...prev.steps, placeholder] };
            }
            const updated = prev.steps.map((s, idx, arr) =>
              idx === arr.length - 1 ? { ...s, reasoning: parsed.text } : s
            );
            return { ...prev, logs: newLogs, steps: updated };
          }

          if (parsed.kind === "action") {
            const toolName = parsed.tool;
            const tool: BrowserStep["tool"] = toolName; 

            // Track invoked tool names (dedupe)
            const nextInvoked = new Set(prev.invokedTools);
            nextInvoked.add(toolName);

            // Align action to adjusted step numbering
            if (stepOffsetRef.current === 0 && prev.steps.length === 0 && parsed.step > 1) {
              stepOffsetRef.current = parsed.step - 1;
            }
            const displayStep = Math.max(1, parsed.step - stepOffsetRef.current);

            // Prefer updating the step with matching number; else update the last
            const updated = (prev.steps.length > 0 ? prev.steps : []).map((s) => {
              if (s.stepNumber !== displayStep) return s;
              const sameTool = s.tool === tool;
              const sameArgs = JSON.stringify(s.actionArgs) === JSON.stringify(parsed.args);
              if (sameTool && sameArgs) return s;
              return { ...s, tool, actionArgs: parsed.args };
            });
            // If there is no step to attach to, create one
            const hasTarget = updated.length > 0 && updated.some((s) => s.stepNumber === displayStep);
            if (!hasTarget) {
              const newStep: BrowserStep = {
                stepNumber: displayStep,
                text: "",
                reasoning: "",
                tool,
                instruction: "",
                actionArgs: parsed.args,
              };
              return { ...prev, logs: newLogs, invokedTools: Array.from(nextInvoked), steps: [...prev.steps, newStep] };
            }
            return { ...prev, logs: newLogs, invokedTools: Array.from(nextInvoked), steps: updated };
          }

          return { ...prev, logs: newLogs };
        });
      } catch (err) {
        console.error("Error parsing log event:", err);
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs, { message: String((e as MessageEvent).data) }],
        }));
      }
    });

    // Disable SSE 'step' duplication: logs already carry summary/action
    es.addEventListener("step", () => {});

    es.addEventListener("done", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        
        // Derive final message from payload
        let finalMessage: string | undefined;
        if (payload.finalMessage) {
          finalMessage = payload.finalMessage;
        } else if (payload.output) {
          finalMessage = payload.output;
        } else if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
          const lastMessage = payload.messages[payload.messages.length - 1];
          finalMessage = typeof lastMessage === 'string' ? lastMessage : lastMessage.text;
        }
        
        // If no final message in payload, fall back to last MESSAGE step
        if (!finalMessage) {
          setState((prev) => {
            const lastMessageStep = [...prev.steps]
              .reverse()
              .find(step => step.tool === "MESSAGE" && step.text);
            if (lastMessageStep?.text) {
              finalMessage = lastMessageStep.text;
            }
            return prev;
          });
        }
        
        // Append final answer step if we have a message and haven't added it yet
        if (finalMessage && finalMessageAddedRef.current !== finalMessage) {
          finalMessageAddedRef.current = finalMessage;
          setState((prev) => {
            const finalStep: BrowserStep = {
              stepNumber: prev.steps.length + 1,
              text: finalMessage!,
              reasoning: "",
              tool: "MESSAGE",
              instruction: "Final Answer",
            };
            return {
              ...prev,
              steps: [...prev.steps, finalStep],
              isFinished: true,
            };
          });
        } else {
          setState((prev) => ({
            ...prev,
            isFinished: true,
          }));
        }

        onDoneRef.current?.(payload);
        // Clear the session promise for this goal to allow future runs
        sessionCreationPromises.delete(goal);
      } catch (err) {
        console.error("Error parsing done event:", err);
      }
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener("error", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        const errorMessage = payload.message || "Connection lost. Please try again.";
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isFinished: true,
        }));
        onErrorRef.current?.(errorMessage);
      } catch {
        const errorMessage = "Connection lost. Please try again.";
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isFinished: true,
        }));
        onErrorRef.current?.(errorMessage);
      }
      // Clear the session promise for this goal to allow retries
      sessionCreationPromises.delete(goal);
      es.close();
      eventSourceRef.current = null;
    });

      // Store es in a variable for cleanup
      return () => {
        es.close();
      };
    };

    // Call the initialization function
    initializeStream();

    // Cleanup function for useEffect
    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [sessionId, goal, parseLog, isEmptyObject, provider]);

  return {
    ...state,
    stop,
  };
}