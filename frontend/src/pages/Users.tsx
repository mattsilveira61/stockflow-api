import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Pencil, Plus, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useInvalidate } from "../api/hooks";
import type { Role, User } from "../api/types";
import { FormError, SelectField, SwitchField, TextField } from "../components/form";
import { PageHeader } from "../components/Layout";
import { Drawer, OverlayBody, OverlayFooter } from "../components/Overlay";
import { Table, Td, Th } from "../components/Table";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from "../components/ui";
import { formErrors } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { ROLE_LABEL, useSession } from "../lib/session";

const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Tudo, inclusive catálogo e usuários",
  OPERADOR: "Pedidos, compras, movimentações, clientes e fornecedores",
  LEITOR: "Só consulta",
};

/** Só o admin chega aqui (o menu esconde e a API responde 403 para os outros). */
export function UsersPage() {
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") });

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Usuários"
        actions={
          <Button icon={Plus} onClick={() => setEditing("new")}>
            Novo usuário
          </Button>
        }
      />
      <Card className="rise">
        {users.isPending ? (
          <Spinner />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState icon={UserCog} title="Nenhum usuário" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th className="hidden md:table-cell">E-mail</Th>
                <Th>Perfil</Th>
                <Th>Situação</Th>
                <Th className="hidden lg:table-cell">Desde</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className={clsx("hover:bg-sunken/60", !u.is_active && "text-ink-3")}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="num hidden text-xs text-ink-2 md:table-cell">{u.email}</Td>
                  <Td>
                    <Badge tone={u.role === "ADMIN" ? "signal" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                  </Td>
                  <Td>{u.is_active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                  <Td className="num hidden text-xs text-ink-3 lg:table-cell">{formatDateTime(u.created_at).split(",")[0]}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" icon={Pencil} onClick={() => setEditing(u)} aria-label={`Editar ${u.name}`} className="h-8 px-2.5">
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo usuário" : "Editar usuário"} eyebrow="Administração">
        {editing !== null && <UserForm user={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const me = useSession()?.user;
  const self = user?.id === me?.id;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "OPERADOR");
  const [active, setActive] = useState(user?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();

  const save = useMutation({
    mutationFn: (body: object) => (user ? api.patch<User>(`/users/${user.id}`, body) : api.post<User>("/users", body)),
    onSuccess: async () => {
      await invalidate(["users"]);
      toast.success(user ? "Usuário atualizado." : "Usuário criado.");
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
    if (name.trim().length < 2) local.name = "Informe o nome";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) local.email = "E-mail inválido";
    if ((!user || password) && password.length < 8) local.password = "Mínimo de 8 caracteres";
    setErrors(local);
    if (Object.keys(local).length) return;
    const body: Record<string, unknown> = { name: name.trim(), email: email.trim(), role };
    if (password) body.password = password;
    if (user) body.is_active = active;
    save.mutate(body);
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <OverlayBody>
        <FormError message={general} />
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField
          label={user ? "Nova senha (opcional)" : "Senha"}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={user ? "Deixe em branco para manter a senha atual" : "Mínimo de 8 caracteres"}
        />
        <SelectField
          label="Perfil"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          hint={self ? "Você não pode tirar o próprio perfil de administrador" : ROLE_HINT[role]}
          disabled={self}
        >
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </SelectField>
        {user && !self && (
          <SwitchField label="Ativo" description="Usuário inativo não entra no sistema e perde o acesso na hora." checked={active} onChange={setActive} />
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {user ? "Salvar" : "Criar usuário"}
        </Button>
      </OverlayFooter>
    </form>
  );
}
