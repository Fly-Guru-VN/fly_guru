import type { Metadata } from "next";
import { MaterialsScreen } from "@/app/[locale]/admin/materials/MaterialsScreen";

export const metadata: Metadata = { title: "СММ · Материалы" };

export default function SmmMaterialsPage() {
  return <MaterialsScreen />;
}
