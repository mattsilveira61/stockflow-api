import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Tags } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { useCategories, useInvalidate } from "../api/hooks";
import type { Category } from "../api/types";
import { FormError, SwitchField, TextAreaField, TextField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Drawer, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formErrors } from "../lib/errors";

export function CategoriesPage() {
  const categories = useCategories();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Categorias"
        actions={
          <WriteGuard need="admin">
            <Button icon={Plus} onClick={() => setEditing("new")}>
              Nova categoria
            </Button>
          </WriteGuard>
        }
      />
      <Card className="rise">
        {categories.isPending ? (
          <Spinner />
        ) : categories.isError ? (
          <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
        ) : categories.data.items.length === 0 ? (
          <EmptyState icon={Tags} title="Nenhuma categoria" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th className="hidden md:table-cell">Descrição</Th>
                <Th>Situação</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {categories.data.items.map((c) => (
                <tr key={c.id} className="hover:bg-sunken/60">
                  <Td>
                    <Link to={`/produtos?category_id=${c.id}&status=all`} className="font-medium hover:text-signal-ink hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td className="hidden text-ink-2 md:table-cell">{c.description ?? "—"}</Td>
                  <Td>{c.is_active ? <Badge tone="ok">Ativa</Badge> : <Badge>Desativada</Badge>}</Td>
                  <Td className="text-right">
                    <WriteGuard need="admin">
                      <Button variant="ghost" icon={Pencil} onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} className="h-8 px-2.5">
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    </WriteGuard>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nova categoria" : "Editar categoria"}
        eyebrow="Catálogo"
      >
        {editing !== null && <CategoryForm category={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (body: object) => (category ? api.patch<Category>(`/categories/${category.id}`, body) : api.post<Category>("/categories", body)),
    onSuccess: async () => {
      await invalidate(["categories"]);
      toast.success(category ? "Categoria atualizada." : "Categoria criada.");
      onDone();
    },
    onError: (err) => {
      const r = formErrors(err, { CATEGORY_NAME_TAKEN: "name" });
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Informe o nome" });
    // Descrição vazia vira "" (apaga); null no PATCH significaria "não mexer".
    save.mutate({ name: name.trim(), description: description.trim(), ...(category ? { is_active: active } : {}) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <OverlayBody>
        <FormError message={general} />
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <TextAreaField label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {category && (
          <SwitchField
            label="Categoria ativa"
            description="Desativada não pode receber produtos novos. Os produtos que já estão nela continuam."
            checked={active}
            onChange={setActive}
          />
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {category ? "Salvar" : "Criar categoria"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
