import { HardHat } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Card, EmptyState } from "../components/ui";

/** Páginas que chegam nas próximas etapas. */
export function SoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={HardHat} title="Em construção">
          Esta tela chega na próxima etapa do projeto.
        </EmptyState>
      </Card>
    </>
  );
}
