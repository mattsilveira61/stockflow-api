import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { useInvalidate } from "../api/hooks";
import type { Customer, Page } from "../api/types";
import { FormError, TextField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Drawer, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Pagination, Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { WriteGuard } from "../components/WriteGuard";
import { formErrors } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { useUrlFilters } from "../lib/useUrlFilters";

const DEFAULTS = { q: "", page: "1" };

export function CustomersPage() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => search !== f.q && setF({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search, f.q, setF]);

  const customers = useQuery({
    queryKey: ["customers", "list", f],
    queryFn: () => api.get<Page<Customer>>("/customers", { q: f.q, page: f.page, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Clientes"
        actions={
          <WriteGuard>
            <Button icon={Plus} onClick={() => setEditing("new")}>
              Novo cliente
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

        {customers.isPending ? (
          <Spinner />
        ) : customers.isError ? (
          <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
        ) : customers.data.items.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" />
        ) : (
          <div className={clsx(customers.isPlaceholderData && "opacity-60")}>
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>E-mail</Th>
                  <Th className="hidden md:table-cell">Desde</Th>
                  <Th className="text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {customers.data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-sunken/60">
                    <Td>
                      <Link to={`/pedidos?customer_id=${c.id}`} title="Ver pedidos deste cliente" className="font-medium hover:text-signal-ink hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td className="num text-xs text-ink-2">{c.email}</Td>
                    <Td className="num hidden text-xs text-ink-3 md:table-cell">{formatDateTime(c.created_at).split(",")[0]}</Td>
                    <Td className="text-right">
                      <WriteGuard>
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} className="h-8 px-2.5">
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                      </WriteGuard>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={customers.data.page}
              pages={customers.data.pages}
              total={customers.data.total}
              onPage={(page) => setF({ page: String(page) })}
              noun={["cliente", "clientes"]}
            />
          </div>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo cliente" : "Editar cliente"} eyebrow="Vendas">
        {editing !== null && <CustomerForm customer={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: () => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (body: object) => (customer ? api.patch<Customer>(`/customers/${customer.id}`, body) : api.post<Customer>("/customers", body)),
    onSuccess: async () => {
      await invalidate(["customers"], ["orders"]);
      toast.success(customer ? "Cliente atualizado." : "Cliente cadastrado.");
      onDone();
    },
    onError: (err) => {
      const r = formErrors(err, { EMAIL_TAKEN: "email" });
      setErrors(r.fields);
      setGeneral(r.general);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Informe o nome";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = "E-mail inválido";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ name: name.trim(), email: email.trim() });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <OverlayBody>
        <FormError message={general} />
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} hint="Usado como identificador único do cliente" />
        <p className="rounded-[3px] bg-sunken px-3 py-2.5 text-xs text-ink-2">Use apenas dados fictícios: este é um projeto de demonstração.</p>
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {customer ? "Salvar" : "Cadastrar"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
