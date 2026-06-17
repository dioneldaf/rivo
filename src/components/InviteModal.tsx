import { useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { inviteToGroup } from "../lib/api";
import { useToast } from "../providers/ToastProvider";

export default function InviteModal({
  open,
  onClose,
  groupId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [identifier, setIdentifier] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!identifier.trim()) return;
    setSaving(true);
    try {
      await inviteToGroup(groupId, identifier);
      toast.success("Invitación enviada.");
      setIdentifier("");
      onClose();
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar al grupo"
      description="Ingresa el correo o el nombre de usuario de la persona."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!identifier.trim()} onClick={submit}>
            Enviar invitación
          </Button>
        </>
      }
    >
      <div>
        <label className="field-label">Correo o usuario</label>
        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="correo@ejemplo.com o usuario"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </div>
    </Modal>
  );
}
