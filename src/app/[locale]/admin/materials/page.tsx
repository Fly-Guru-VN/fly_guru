import type { Metadata } from "next";
import { MaterialsScreen } from "./MaterialsScreen";

export const metadata: Metadata = { title: "Админка · Материалы" };

export default function AdminMaterialsPage() {
  return <MaterialsScreen />;
}
