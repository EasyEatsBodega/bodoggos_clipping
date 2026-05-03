import Link from "next/link";
import { Header } from "@/components/Header";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header crumbs={[{ label: "CLIPPER.OPS" }]} />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <div className="max-w-2xl">
          <p className="label mb-6">campaign / open</p>
          <h1 className="font-serif text-6xl leading-[1.05] mb-6">
            Post a clip. <em>Track impressions.</em> Get paid in USDC.
          </h1>
          <p className="text-text-2 mb-10 max-w-lg">
            $4 CPM, capped per clip. 7-day tracking window from the moment you submit.
            Paid manually after the window closes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={"/api/auth/x/start" as never} className="btn btn-primary">
              Continue with X
            </Link>
            <Link href={"/auth/magic" as never} className="btn btn-ghost">
              Magic link via email
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {[
            { k: "RATE", v: "$4.00 / 1k" },
            { k: "CAP / CLIP", v: "$75" },
            { k: "WINDOW", v: "7 DAYS" },
          ].map((s) => (
            <div key={s.k} className="bg-bg p-6">
              <div className="label mb-2">{s.k}</div>
              <div className="num text-3xl">{s.v}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
