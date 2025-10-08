"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserStep, ActionArgs } from "@/app/types/ChatFeed";
import { UseAgentStreamProps, AgentStreamState } from "@/app/types/Agent";

// Global trackers to avoid duplicate session creation in React Strict Mode
// by sharing a single in-flight promise across mounts for the same goal.
const sessionCreationPromises = new Map<
  string,
  Promise<{ sessionId: string; sessionUrl: string | null; }>
>();

export function useAgentStreamOpenAI({
  sessionId,
  goal,
  onStart,
  onDone,
  onError,
  provider = "openai",
}: UseAgentStreamProps & { provider?: string }) {
  console.log(`[useAgentStream] Hook called with goal: "${goal?.substring(0, 50)}...", sessionId: ${sessionId}`);
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

  useEffect(() => {
    console.log(`[useAgentStream] useEffect triggered with goal: "${goal?.substring(0, 50)}..."`);
    if (!goal) {
      console.log(`[useAgentStream] No goal, returning`);
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

              console.log(`[useAgentStream] Session created successfully: ${sessionData.sessionId}`);
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

    // Handle step events
    es.addEventListener("step", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        const stepNumber = payload.stepNumber;
        stepCounterRef.current = stepNumber;
      } catch (err) {
        console.error("Error parsing step event:", err);
      }
    });

    // Handle reasoning events
    es.addEventListener("reasoning", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { content: string; timestamp?: number; stepNumber?: number };

        setState((prev) => {
          const incomingStep = payload.stepNumber;
          const activeStep = typeof incomingStep === "number" && !Number.isNaN(incomingStep)
            ? incomingStep
            : stepCounterRef.current;
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex((s) => s.stepNumber === activeStep);

          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              reasoning: payload.content,
            };
          } else {
            // Create a new step for the reasoning
            const newStep: BrowserStep = {
              stepNumber: activeStep,
              text: "",
              reasoning: payload.content,
              tool: "MESSAGE",
              instruction: "",
            };
            updatedSteps.push(newStep);
          }

          updatedSteps.sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0));

          return { ...prev, steps: updatedSteps };
        });
      } catch (err) {
        console.error("Error parsing reasoning event:", err);
      }
    });

    // Handle tool events (computer_call and function_call)
    es.addEventListener("tool", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        
        setState((prev) => {
          const currentStep = stepCounterRef.current;
          const nextInvoked = new Set(prev.invokedTools);
          
          // Determine the tool name
          let toolName = payload.tool;
          if (payload.type === "computer_call") {
            toolName = "computer";
          }
          nextInvoked.add(toolName);
          
          // Build action args
          const actionArgs: ActionArgs = { action: "" };
          if (payload.type === "computer_call") {
            actionArgs.action = payload.action;
            actionArgs.callId = payload.callId;
          } else if (payload.type === "function_call") {
            actionArgs.name = payload.tool;
            actionArgs.callId = payload.callId;
          }
          
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex(s => s.stepNumber === currentStep);
          
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              tool: toolName,
              actionArgs,
            };
          } else {
            // Create a new step for the tool call
            const newStep: BrowserStep = {
              stepNumber: currentStep,
              text: "",
              reasoning: "",
              tool: toolName,
              instruction: "",
              actionArgs,
            };
            updatedSteps.push(newStep);
          }
          
          return { ...prev, steps: updatedSteps, invokedTools: Array.from(nextInvoked) };
        });
      } catch (err) {
        console.error("Error parsing tool event:", err);
      }
    });

    // Handle message events
    es.addEventListener("message", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        
        setState((prev) => {
          const currentStep = stepCounterRef.current;
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex(s => s.stepNumber === currentStep);
          
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              text: payload.content,
            };
          } else {
            // Create a new step for the message
            const newStep: BrowserStep = {
              stepNumber: currentStep,
              text: payload.content,
              reasoning: "",
              tool: "MESSAGE",
              instruction: "",
            };
            updatedSteps.push(newStep);
          }
          
          return { ...prev, steps: updatedSteps };
        });
      } catch (err) {
        console.error("Error parsing message event:", err);
      }
    });

    // Handle generic log events
    es.addEventListener("log", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs, payload],
        }));
      } catch (err) {
        console.error("Error parsing log event:", err);
      }
    });

    // Handle agent error events from the logger
    es.addEventListener("agent_error", (e) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        console.error("OpenAI agent error:", payload.message);
        
        // Could add error handling to UI here if needed
        // For now, just log to console
      } catch (err) {
        console.error("Error parsing agent_error event:", err);
      }
    });

    es.addEventListener("metrics", (e) => {
      // Skip showing metrics to users - too technical
      try {
        const payload = JSON.parse((e as MessageEvent).data);
        console.log("Metrics received:", payload);
      } catch (err) {
        console.error("Error parsing metrics event:", err);
      }
    });

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
  }, [sessionId, goal, provider]);

  return {
    ...state,
    stop,
  };
}
