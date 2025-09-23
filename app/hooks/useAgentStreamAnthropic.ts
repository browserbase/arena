"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserStep } from "../types/ChatFeed";
import { AgentLog, UseAgentStreamProps, AgentStreamState, LogEvent } from "../types/Agent";

// Global trackers to avoid duplicate session creation in React Strict Mode
// by sharing a single in-flight promise across mounts for the same goal.
const sessionCreationPromises = new Map<
  string,
  Promise<{ sessionId: string; sessionUrl: string | null; connectUrl: string | null }>
>();

export function useAgentStreamAnthropic({
  sessionId,
  goal,
  onStart,
  onDone,
  onError,
}: UseAgentStreamProps) {
  const [state, setState] = useState<AgentStreamState>({
    sessionId: sessionId,
    sessionUrl: null,
    connectUrl: null,
    steps: [],
    logs: [],
    isLoading: false,
    isFinished: false,
    error: null,
    invokedTools: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const stepCounterRef = useRef(0); 
  const stepOffsetRef = useRef(0);
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
    // Parse Anthropic processing blocks
    try {
      const parsed = JSON.parse(raw);
      
      if (parsed.type === "text") {
        const result = { kind: "summary" as const, step: stepCounterRef.current, text: parsed.text };
        return result;
      }
      if (parsed.type === "tool_use") {
        const result = { kind: "action" as const, step: stepCounterRef.current, tool: parsed.name, args: parsed.input };
        return result;
      }
      return null;
    } catch {
      // Fallback for non-JSON logs
      if (raw.startsWith("💭 ")) {
        const result = { kind: "thought" as const, text: raw.slice(2).trim() };
        return result;
      }
      const execMatch = raw.match(/^Executing step\s+(\d+)/i);
      if (execMatch) {
        const stepNum = parseInt(execMatch[1], 10);
        const result = { kind: "summary" as const, step: stepNum, text: "" };
        return result;
      }
      const textBlockMatch = raw.match(/^Found text block:\s*(.*)$/i);
      if (textBlockMatch) {
        const result = { kind: "thought" as const, text: textBlockMatch[1].trim() };
        return result;
      }
      const fnMatch = raw.match(/^Found function call:\s*([A-Za-z0-9_]+)(?:\s+with args:\s*([\s\S]+))?$/i);
      if (fnMatch) {
        let args: unknown = {};
        const jsonText = (fnMatch[2] || "").trim();
        if (jsonText) {
          try {
            args = JSON.parse(jsonText);
          } catch {
            args = jsonText;
          }
        }
        const result = { kind: "action" as const, step: stepCounterRef.current, tool: fnMatch[1], args };
        stepCounterRef.current++;
        return result;
      }
      return null;
    }
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
                connectUrl: (sessionData.connectUrl as string) ?? null,
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
            connectUrl: result.connectUrl,
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

      const es = new EventSource(`/api/agent/anthropic?${params.toString()}`);
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
            // For Anthropic, ensure the first step starts at 1
            if (stepOffsetRef.current === 0 && prev.steps.length === 0) {
              stepOffsetRef.current = parsed.step - 1;
            }
            const displayStep = Math.max(1, parsed.step - stepOffsetRef.current);
            stepCounterRef.current = Math.max(stepCounterRef.current, displayStep);

            const trimmedText = (parsed.text || "").trim();

            if (!trimmedText) {
              return { ...prev, logs: newLogs };
            }

            // For Anthropic, summary text should be the reasoning
            const existingIndex = prev.steps.findIndex((s) => s.stepNumber === displayStep);
            if (existingIndex >= 0) {
              const existing = prev.steps[existingIndex];
              if (trimmedText && trimmedText !== (existing.reasoning || "")) {
                const updated: BrowserStep = {
                  ...existing,
                  reasoning: trimmedText,
                };
                const newSteps = [...prev.steps];
                newSteps[existingIndex] = updated;
                const newState = { ...prev, logs: newLogs, steps: newSteps };
                return newState;
              }
              return { ...prev, logs: newLogs };
            } else {
              // Create new step for summary
              const newStep: BrowserStep = {
                stepNumber: displayStep,
                text: "",
                reasoning: trimmedText,
                tool: "MESSAGE",
                instruction: "",
              };
              const newState = { ...prev, logs: newLogs, steps: [...prev.steps, newStep] };
              return newState;
            }
          }

          if (parsed.kind === "thought") {
            // Add thought text to the reasoning of the last step
            if (prev.steps.length > 0) {
              const lastStepIndex = prev.steps.length - 1;
              const lastStep = prev.steps[lastStepIndex];
              const updated: BrowserStep = {
                ...lastStep,
                reasoning: (lastStep.reasoning ? lastStep.reasoning + " " : "") + parsed.text,
              };
              const newSteps = [...prev.steps];
              newSteps[lastStepIndex] = updated;
              return { ...prev, logs: newLogs, steps: newSteps };
            }
            // If no steps, create a new one for the thought
            const newStep: BrowserStep = {
              stepNumber: 1,
              text: "",
              reasoning: parsed.text,
              tool: "MESSAGE",
              instruction: "",
            };
            stepCounterRef.current = Math.max(stepCounterRef.current, 1);
            return { ...prev, logs: newLogs, steps: [newStep] };
          }

          if (parsed.kind === "action") {
            const toolName = parsed.tool;
            const tool: BrowserStep["tool"] = toolName;

            // Track invoked tool names (dedupe)
            const nextInvoked = new Set(prev.invokedTools);
            nextInvoked.add(toolName);

            // Align action to adjusted step numbering
            if (stepOffsetRef.current === 0 && prev.steps.length === 0) {
              stepOffsetRef.current = parsed.step - 1;
            }
            const displayStep = Math.max(1, parsed.step - stepOffsetRef.current);
            stepCounterRef.current = Math.max(stepCounterRef.current, displayStep);

            // Always create/update the step since actions have meaningful content
            const existingIndex = prev.steps.findIndex((s) => s.stepNumber === displayStep);

            if (existingIndex >= 0) {
              // Update existing step
              const existing = prev.steps[existingIndex];
              const updated: BrowserStep = {
                ...existing,
                tool,
                actionArgs: parsed.args,
              };
              const newSteps = [...prev.steps];
              newSteps[existingIndex] = updated;
              const newState = { ...prev, logs: newLogs, invokedTools: Array.from(nextInvoked), steps: newSteps };
              return newState;
            } else {
              // Create a new step for this action since actions have meaningful content
              const newStep: BrowserStep = {
                stepNumber: displayStep,
                text: "",
                reasoning: "",
                tool,
                instruction: "",
                actionArgs: parsed.args,
              };
              const newState = { ...prev, logs: newLogs, invokedTools: Array.from(nextInvoked), steps: [...prev.steps, newStep] };
              return newState;
            }
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
        setState((prev) => ({
          ...prev,
          isFinished: true,
        }));

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
  }, [sessionId, goal, parseLog, isEmptyObject]);

  return {
    ...state,
    stop,
  };
}
