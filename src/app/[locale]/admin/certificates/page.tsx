import type { Metadata } from "next";
import { CertificatesScreen } from "./CertificatesScreen";

export const metadata: Metadata = { title: "Админка · Сертификаты" };

export default function AdminCertificatesPage() {
  return <CertificatesScreen />;
}
