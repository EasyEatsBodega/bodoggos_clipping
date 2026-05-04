import { Header } from "@/components/Header";

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header crumbs={[{ label: "FLICK CLIPPING", href: "/" }, { label: "SUSPENDED" }]} />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <p className="label mb-6">account / suspended</p>
        <h1 className="font-serif text-4xl mb-4">This account is suspended.</h1>
        <p className="text-text-2 max-w-md text-sm">
          You can&apos;t submit clips while your account is suspended. If you think this is
          a mistake, reach out to the campaign admin.
        </p>
      </main>
    </div>
  );
}
