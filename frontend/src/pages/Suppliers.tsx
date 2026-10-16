import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Pencil, Plus, Search, Truck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { useInvalidate } from "../api/hooks";
import type { Page, Supplier } from "../api/types";
import { FormError, SwitchField, TextField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Drawer, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Pagination, Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formErrors } from "../lib/errors";
import { useUrlFilters } from "../lib/useUrlFilters";

const DEFAULTS = { q: "", page: "1" };

export function SuppliersPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => search !== f.q && setF({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, f.q, setF]);

  const suppliers = useQuery({
    queryKey: ["suppliers", "list", f],
    queryFn: () => api.get<Page<Supplier>>("/suppliers", { q: f.q, page: f.page, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Fornecedores"
        actions={
          <WriteGuard>
            <Button icon={Plus} onClick={() => setEditing("new")}>
              Novo fornecedor
            </Button>
          </WriteGuard>
        }
      />
      <Card className="rise">
        <div className="border-b border-line px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              aria-label="Buscar por nome ou e-mail"
              placeholder="Buscar por nome ou e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-[3px] border border-line-strong bg-paper pr-3 pl-9 text-sm outline-none focus:border-ink"
            />
          </div>
        </div>

        {suppliers.isPending ? (
          <Spinner />
        ) : suppliers.isError ? (
          <ErrorState error={suppliers.error} onRetry={() => suppliers.refetch()} />
        ) : suppliers.data.items.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum fornecedor encontrado" />
        ) : (
          <div className={clsx(suppliers.isPlaceholderData && "opacity-60")}>
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th className="hidden md:table-cell">Contato</Th>
                  <Th>Situação</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {suppliers.data.items.map((s) => (
                  <tr key={s.id} className={clsx("hover:bg-sunken/60", !s.is_active && "text-ink-3")}>
                    <Td>
                      <Link to={`/compras?supplier_id=${s.id}`} title="Ver compras deste fornecedor" className="font-medium hover:text-signal-ink hover:underline">
                        {s.name}
                      </Link>
                    </Td>
                    <Td className="num hidden text-xs text-ink-2 md:table-cell">{[s.email, s.phone].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td>{s.is_active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                    <Td className="text-right">
                      <WriteGuard>
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`} className="h-8 px-2.5">
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                      </WriteGuard>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={suppliers.data.page}
              pages={suppliers.data.pages}
              total={suppliers.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["fornecedor", "fornecedores"]}
            />
          </div>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo fornecedor" : "Editar fornecedor"} eyebrow="Compras">
        {editing !== null && <SupplierForm supplier={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

function SupplierForm({ supplier, onDone }: { supplier?: Supplier; onDone: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [active, setActive] = useState(supplier?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (body: object) => (supplier ? api.patch<Supplier>(`/suppliers/${supplier.id}`, body) : api.post<Supplier>("/suppliers", body)),
    onSuccess: async () => {
      await invalidate(["suppliers"], ["purchases"]);
      toast.success(supplier ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      onDone();
    },
    onError: (err) => {
      const r = formErrors(err, { SUPPLIER_NAME_TAKEN: "name" });
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Informe o nome";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) local.email = "E-mail inválido";
    setErrors(local);
    if (Object.keys(local).length) return;
    // Vazio vira null: apaga o contato
    const body: Record<string, unknown> = { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null };
    if (supplier) body.is_active = active;
    save.mutate(body);
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <OverlayBody>
        <FormError message={general} />
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <TextField label="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField label="Telefone (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        {supplier && (
          <SwitchField
            label="Ativo"
            description="Fornecedor inativo não aparece em novas compras; as antigas continuam com ele."
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
          {supplier ? "Salvar" : "Cadastrar"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
