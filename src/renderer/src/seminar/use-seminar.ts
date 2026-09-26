/* The seminar's behaviour, with no opinion about how it looks.
 *
 * There is ONE tutor conversation in this app. It renders in two frames — the
 * course view's docked column and onboarding's centred column — and those
 * frames differ in layout only. Everything that makes the conversation work
 * (the reducer, the event and snapshot subscriptions, auto-start, and every
 * action that reaches the conductor) lives here, so the two frames can never
 * drift into two behaviours. */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SessionControlPatch, SessionControls } from "../../../shared/seminar";
import { createSeminarState, seminarReducer, type SeminarState } from "./seminar-state";

export interface SeminarController {
  state: SeminarState;
  /** What the learner may change about this session; null when unavailable. */
  controls: SessionControls | null;
  /** Change model, effort, or autonomy for this session only. */
  setControls: (patch: SessionControlPatch) => Promise<boolean>;
  /** A message typed during a turn, waiting for it to finish. Only the
   *  fallback when the provider cannot take it into the running turn. */
  queued: string | null;
  /** Drop the queued message before it is sent. */
  unqueue: () => void;
  /** A refused queued send stays available for a deliberate retry. */
  retryQueued?: () => void;
  /** A turn is in flight: the composer is closed and Stop is offered. */
  busy: boolean;
  /** The previous session never reached a verified close (ADR-009), so the
   *  next open recovers it before any new work. */
  recoveryPending: boolean;
  /** An approval answer is in flight; both buttons disable together. */
  answering: boolean;
  start: () => Promise<void>;
  confirmModel: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
  retry: () => Promise<void>;
  answerApproval: (allow: boolean) => Promise<void>;
  /** Allow the pending approval AND every later course-folder file edit, for
   *  this session only. Resolves true when the grant took. */
  allowCourseEdits: () => Promise<boolean>;
  interrupt: () => void;
  end: () => Promise<void>;
}

export function useSeminar({
  currentModuleId,
  autoStart,
}: {
  currentModuleId: string | null;
  autoStart: boolean;
}): SeminarController {
  const [state, dispatch] = useReducer(seminarReducer, undefined, createSeminarState);
  const [answering, setAnswering] = useState(false);
  const [controls, setControlsState] = useState<SessionControls | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [queueBlocked, setQueueBlocked] = useState(false);
  const autoStarted = useRef(false);

  const busy =
    state.phase === "opening" ||
    state.phase === "thinking" ||
    state.phase === "streaming" ||
    state.phase === "tool-activity";

  const failed = useCallback((error: unknown, fallback: string): string => {
    return error instanceof Error ? error.message : fallback;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (state.phase !== "closed") return;
    dispatch({ type: "open_started" });
    try {
      const reply = await window.praxeum.startSeminar(currentModuleId);
      if (!reply.ok) {
        dispatch({ type: "open_failed", message: reply.detail });
        return;
      }
      dispatch({ type: "open_succeeded" });
    } catch (error) {
      dispatch({
        type: "open_failed",
        message: failed(error, "The tutor could not be started."),
      });
    }
  }, [currentModuleId, failed, state.phase]);

  useEffect(() => {
    const unsubscribeEvent = window.praxeum.onSeminarEvent((event) => {
      if (event.type === "turn_complete") setQueueBlocked(false);
      dispatch({ type: "event", event });
    });
    const unsubscribeSnapshot = window.praxeum.onSeminarSnapshot((snapshot) => {
      dispatch({ type: "hydrate", snapshot });
    });
    void window.praxeum.currentSeminar().then((snapshot) => {
      dispatch({ type: "hydrate", snapshot });
    });
    return () => {
      unsubscribeEvent();
      unsubscribeSnapshot();
    };
  }, []);

  useEffect(() => {
    if (!autoStart || autoStarted.current || state.phase !== "closed") return;
    autoStarted.current = true;
    void start();
  }, [autoStart, start, state.phase]);

  const queue = useCallback((message: string): void => {
    setQueued((pending) => (pending === null ? message : `${pending}\n\n${message}`));
  }, []);

  /** Resolves true when the message was accepted — sent now, taken into the
   *  running turn, or queued for the moment this turn ends. The caller clears
   *  its draft only then, so nothing typed is ever lost. */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const message = text.trim();
      if (message === "" || state.phase === "choosing-model") return false;
      // A turn in flight does not mean "wait, then retype". A provider that
      // reports it can steer takes the message into the running turn (the
      // tutor sees it at its next step); otherwise the app holds it and sends
      // it the moment the tutor finishes — either way the learner keeps their
      // train of thought. The conductor persists a steered message only once
      // the provider accepted it, so a refusal here means it never landed and
      // the queue takes it instead.
      if (state.phase !== "idle") {
        if (state.phase === "closed") return false;
        if (!state.steerable) {
          queue(message);
          return true;
        }
        const id = crypto.randomUUID();
        dispatch({ type: "steer_learner", id, text: message });
        try {
          await window.praxeum.sendSeminarMessage(message);
        } catch {
          dispatch({ type: "steer_failed", id });
          queue(message);
        }
        return true;
      }
      const id = crypto.randomUUID();
      dispatch({ type: "submit_learner", id, text: message });
      try {
        await window.praxeum.sendSeminarMessage(message);
        return true;
      } catch (error) {
        dispatch({
          type: "submit_failed",
          id,
          message: failed(error, "That message could not be sent."),
        });
        return false;
      }
    },
    [failed, queue, state.phase, state.steerable],
  );

  /* Flush the queue when the turn ends. Sending goes through the same path a
     typed message does, so the transcript cannot tell the difference — the
     queue is a waiting room, not a second way to talk. */
  const flushing = useRef(false);
  useEffect(() => {
    if (queued === null || queueBlocked || state.phase !== "idle" || flushing.current) return;
    flushing.current = true;
    const message = queued;
    setQueued(null);
    void (async () => {
      const id = crypto.randomUUID();
      dispatch({ type: "submit_learner", id, text: message });
      try {
        await window.praxeum.sendSeminarMessage(message);
      } catch (error) {
        setQueueBlocked(true);
        setQueued((pending) => (pending === null ? message : `${message}\n\n${pending}`));
        dispatch({
          type: "submit_failed",
          id,
          message: failed(error, "That message could not be sent."),
          retained: true,
        });
      } finally {
        flushing.current = false;
      }
    })();
  }, [failed, queued, queueBlocked, state.phase]);

  const retry = useCallback(async (): Promise<void> => {
    if (state.phase !== "idle") return;
    dispatch({ type: "retry_started" });
    try {
      await window.praxeum.retrySeminarTurn();
    } catch (error) {
      dispatch({
        type: "submit_failed",
        id: "retry",
        message: failed(error, "That request could not be sent again."),
      });
    }
  }, [failed, state.phase]);

  const answerApproval = useCallback(
    async (allow: boolean): Promise<void> => {
      if (state.approval === null || answering) return;
      setAnswering(true);
      try {
        await window.praxeum.respondToSeminarApproval(state.approval.requestId, allow);
        dispatch({ type: "approval_answered" });
      } catch (error) {
        dispatch({
          type: "approval_failed",
          message: failed(error, "That approval response failed."),
        });
      } finally {
        setAnswering(false);
      }
    },
    [answering, failed, state.approval],
  );

  const allowCourseEdits = useCallback(async (): Promise<boolean> => {
    if (state.approval === null || !state.approval.editWithinCourse || answering) return false;
    setAnswering(true);
    try {
      await window.praxeum.allowSeminarCourseEdits(state.approval.requestId);
      dispatch({ type: "approval_answered" });
      return true;
    } catch (error) {
      dispatch({
        type: "approval_failed",
        message: failed(error, "That approval response failed."),
      });
      return false;
    } finally {
      setAnswering(false);
    }
  }, [answering, failed, state.approval]);

  /* Controls are re-read when a session opens and after each turn: the
     provider reports the resolved model on its init frame, which lands after
     the surface has already mounted. */
  const sessionOpen = state.phase !== "closed";
  const turnIdle = state.phase === "idle";
  const modelChoiceId = state.modelChoice?.runtimeId;
  useEffect(() => {
    if (!sessionOpen) {
      setControlsState(null);
      return;
    }
    let cancelled = false;
    void window.praxeum
      .seminarControls()
      .then((next) => {
        if (!cancelled && next !== null) setControlsState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionOpen, state.items.length, turnIdle, modelChoiceId]);

  const setControls = useCallback(async (patch: SessionControlPatch): Promise<boolean> => {
    dispatch({ type: "control_change_started" });
    try {
      const next = await window.praxeum.setSeminarControls(patch);
      if (next === null) throw new Error("Session controls are unavailable.");
      setControlsState(next);
      dispatch({ type: "control_change_succeeded" });
      return true;
    } catch {
      // Claude controls are separate acknowledged calls. If a later call fails,
      // re-read any earlier accepted change instead of leaving a stale pill.
      try {
        const next = await window.praxeum.seminarControls();
        if (next !== null) setControlsState(next);
      } catch {
        /* Keep the last confirmed controls if the read also fails. */
      }
      dispatch({
        type: "control_change_failed",
        message:
          "That change couldn't be completed. Your tutor is still connected. Check the settings shown and try again.",
      });
      return false;
    }
  }, []);

  const interrupt = useCallback((): void => {
    void window.praxeum.interruptSeminar().catch((error: unknown) => {
      dispatch({
        type: "event",
        event: {
          type: "error",
          code: "turn-failed",
          message: failed(error, "The tutor could not be interrupted."),
        },
      });
    });
  }, [failed]);

  const end = useCallback(async (): Promise<void> => {
    if (state.phase !== "idle") return;
    try {
      await window.praxeum.endSeminar();
    } catch (error) {
      dispatch({
        type: "request_failed",
        message: failed(error, "The session could not be closed."),
      });
    }
  }, [failed, state.phase]);

  return {
    state,
    busy,
    controls,
    setControls,
    queued,
    ...(queueBlocked
      ? {
          retryQueued: () => {
            setQueueBlocked(false);
          },
        }
      : {}),
    unqueue: () => {
      setQueued(null);
      setQueueBlocked(false);
    },
    recoveryPending: state.lifecycle === "recoverable" || state.lifecycle === "close-failed",
    answering,
    start,
    confirmModel: async () => {
      if (state.modelChoice === undefined) return;
      try {
        await window.praxeum.confirmSeminarModel(state.modelChoice.runtimeId);
      } catch (error) {
        dispatch({
          type: "control_change_failed",
          message: failed(error, "The tutor could not start. Check your model and try again."),
        });
      }
    },
    send,
    retry,
    answerApproval,
    allowCourseEdits,
    interrupt,
    end,
  };
}
