import { redirect } from "next/navigation";

export default function PermissionsRedirect() {
  redirect("/settings/users");
}
