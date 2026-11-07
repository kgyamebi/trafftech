import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/forms";
import { startDemoAction } from "@/server/actions";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthFrame title="Welcome back." body="Your garage, notices and score are on this account. Demo data is a different door.">
      <LoginForm />
      <form action={startDemoAction}>
        <button className="btn btn-ghost w-full" type="submit">Explore the demo</button>
      </form>
      <p className="text-sm text-muted">New here? <Link className="underline" href="/signup">Create an account</Link></p>
    </AuthFrame>
  );
}
