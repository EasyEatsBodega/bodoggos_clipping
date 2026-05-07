import { SolanaWalletProvider } from "@/components/admin/SolanaWalletProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}
