import {
  BarChart3,
  CheckCircle2,
  Fuel,
  MonitorSmartphone,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useUpdateProfile } from "../api/hooks";
import type { User } from "../api/types";
import { Button } from "../components/ui";
import { canPromptInstall, isAndroid, isIOS, isStandalone, promptInstall } from "../lib/install";
import VehicleFormPage from "./VehicleForm";

/** Illustrative tour cards — deliberately not spotlights on the live UI,
 * which is empty at this point (see ROADMAP.md). */
const TOUR = [
  {
    icon: Warehouse,
    title: "Your garage",
    body: "Every vehicle gets a card with the numbers that matter — current odometer, average economy, and whatever service is coming up next.",
  },
  {
    icon: Fuel,
    title: "Logging at the pump",
    body: "The Log tab is built for one hand at the pump: type any two of gallons, price, and total, and the third fills itself in. Partial and missed fills are handled honestly, so your MPG is never a made-up number.",
  },
  {
    icon: Wrench,
    title: "Service & reminders",
    body: "Log oil changes, tires, brakes — anything. Reminders work by mileage, by time, or both, and go red when something's overdue.",
  },
  {
    icon: BarChart3,
    title: "Stats that answer questions",
    body: "Trends over time, spending by month — and whether premium fuel is actually cheaper per mile in your car, measured from your own fill-ups.",
  },
] as const;

type Step =
  | { kind: "install" }
  | { kind: "tour"; card: (typeof TOUR)[number] }
  | { kind: "vehicle" }
  | { kind: "done" };

function StepList({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="mt-6 w-full max-w-sm space-y-3 text-left">
      {steps.map((text, index) => (
        <li key={index} className="flex items-center gap-3 rounded-card bg-surface px-4 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-[13px] font-bold text-accent">
            {index + 1}
          </span>
          <span className="text-[14px] text-muted">{text}</span>
        </li>
      ))}
    </ol>
  );
}

function InstallStep() {
  const [installed, setInstalled] = useState(false);
  const ios = isIOS();

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-accent">
        <MonitorSmartphone size={30} strokeWidth={1.6} />
      </div>
      <h2 className="text-[22px] font-extrabold tracking-tight">
        Put Pitstop on your home screen
      </h2>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
        Installed, Pitstop runs full-screen like a real app — and it's worth doing{" "}
        <span className="font-semibold text-text">before</span> you set anything up.
      </p>

      {ios ? (
        <StepList
          steps={[
            <>
              Tap the <span className="font-semibold text-text">⋯</span> button next to the
              address bar
            </>,
            <>
              Tap <span className="font-semibold text-text">Share</span>
            </>,
            <>
              Tap <span className="font-semibold text-text">View More</span>
            </>,
            <>
              Choose <span className="font-semibold text-text">Add to Home Screen</span>, then{" "}
              <span className="font-semibold text-text">Add</span>
            </>,
          ]}
        />
      ) : canPromptInstall() && !installed ? (
        <Button
          className="mt-6"
          onClick={async () => {
            if (await promptInstall()) setInstalled(true);
          }}
        >
          Install Pitstop
        </Button>
      ) : installed ? (
        <p className="mt-6 max-w-sm text-[13px] leading-relaxed text-muted">
          Installed! You can open Pitstop from your apps whenever you like.
        </p>
      ) : isAndroid() ? (
        <StepList
          steps={[
            <>
              Tap your browser's <span className="font-semibold text-text">⋮</span> menu
            </>,
            <>
              Choose <span className="font-semibold text-text">Add to Home screen</span> (or{" "}
              <span className="font-semibold text-text">Install app</span>)
            </>,
            <>
              Confirm with <span className="font-semibold text-text">Install</span> or{" "}
              <span className="font-semibold text-text">Add</span>
            </>,
          ]}
        />
      ) : (
        <p className="mt-6 max-w-sm text-[13px] leading-relaxed text-muted">
          On this device you can keep using Pitstop right here in the browser — installing is
          optional. On your phone, look for “install” or “add to home screen” in the browser
          menu.
        </p>
      )}

      <p className="mt-5 max-w-sm text-[12px] leading-relaxed text-muted/80">
        {ios
          ? "Then open Pitstop from your home screen. If it asks you to sign in again, use the same login — this walkthrough picks up right where it left off."
          : "If the installed app asks you to sign in again, use the same login — then this walkthrough picks up right where it left off."}
      </p>
    </div>
  );
}

export default function OnboardingPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const touchX = useRef<number | null>(null);

  // computed once: mid-flow re-evaluation would shift the dots under the user
  const steps = useMemo<Step[]>(
    () => [
      ...(isStandalone() ? [] : [{ kind: "install" } as Step]),
      ...TOUR.map((card) => ({ kind: "tour", card }) as Step),
      { kind: "vehicle" },
      { kind: "done" },
    ],
    []
  );
  const [index, setIndex] = useState(0);
  const step = steps[index];

  const markDone = () => {
    if (!user.onboarding_done) update.mutate({ onboarding_done: true });
  };
  const finish = () => {
    markDone();
    navigate("/", { replace: true });
  };
  const next = () => (index < steps.length - 1 ? setIndex(index + 1) : finish());
  const back = () => index > 0 && setIndex(index - 1);
  const swipeable = step.kind === "install" || step.kind === "tour";

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-lg flex-col px-4">
      {/* progress + skip */}
      <div className="mb-8 flex items-center">
        <div className="flex flex-1 justify-center gap-1.5 pl-10">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
        {step.kind !== "done" ? (
          <button onClick={finish} className="w-10 text-right text-[13px] font-semibold text-muted">
            Skip
          </button>
        ) : (
          <span className="w-10" />
        )}
      </div>

      <div
        className="flex flex-1 flex-col justify-center pb-6"
        onTouchStart={(e) => {
          if (swipeable) touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (!swipeable || touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx < -60) next();
          else if (dx > 60) back();
        }}
      >
        {step.kind === "install" && <InstallStep />}

        {step.kind === "tour" && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-accent">
              <step.card.icon size={30} strokeWidth={1.6} />
            </div>
            <h2 className="text-[22px] font-extrabold tracking-tight">{step.card.title}</h2>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-muted">{step.card.body}</p>
          </div>
        )}

        {step.kind === "vehicle" && (
          <div>
            <h2 className="mb-1 text-[22px] font-extrabold tracking-tight">Add your first vehicle</h2>
            <p className="mb-5 text-[14px] text-muted">
              Car, truck, or EV — this is what you'll log fuel and service against.
            </p>
            <VehicleFormPage
              embedded
              onSaved={() => {
                markDone();
                setIndex(steps.length - 1);
              }}
            />
            <p className="mt-5 text-center text-[13px] leading-relaxed text-muted">
              Already tracking somewhere else? You can bring in your history any time from{" "}
              <span className="font-medium text-text">Settings → Import</span>.
            </p>
          </div>
        )}

        {step.kind === "done" && (
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 size={44} strokeWidth={1.4} className="mb-5 text-good" />
            <h2 className="text-[22px] font-extrabold tracking-tight">You're all set</h2>
            <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
              Log your first fill-up next time you're at the pump — your second full tank is
              when the economy numbers start.
            </p>
            <Button className="mt-7 w-full max-w-sm" onClick={finish}>
              Go to your garage
            </Button>
          </div>
        )}
      </div>

      {(step.kind === "install" || step.kind === "tour") && (
        <div className="space-y-2.5 pb-2">
          <Button className="w-full" onClick={next}>
            {step.kind === "install" ? "Continue" : "Next"}
          </Button>
          {index > 0 && (
            <button onClick={back} className="w-full py-2 text-[14px] font-medium text-muted">
              Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}
