import { Header } from "@/components/Header";
import { AdminNav } from "@/components/admin/AdminNav";
import { CampaignForm } from "@/components/admin/CampaignForm";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "ADMIN.OPS", href: "/admin" },
          { label: "CAMPAIGNS", href: "/admin/campaigns" },
          { label: "NEW" },
        ]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <h1 className="label">new campaign</h1>
        <p className="font-mono text-xs text-text-2 max-w-2xl">
          Saved as a draft by default — only admins can see it until you publish. Edit freely,
          then hit Publish on the campaign page when it's ready for clippers.
        </p>
        <CampaignForm mode="create" />
      </main>
    </div>
  );
}
