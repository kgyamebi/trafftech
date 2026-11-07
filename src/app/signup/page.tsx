import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/forms";

export const metadata = { title: "Create account" };

export default function Page() {
  return (
    <AuthFrame title="Create your driver profile." body="No government connection is made. You will see a short demonstration, then an empty garage.">
      <SignupForm />
      <p className="text-sm text-muted">Already have an account? <Link className="underline" href="/login">Sign in</Link></p>
    </AuthFrame>
  );
}
