/**
 * Seed demo accounts in Supabase Auth.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-accounts.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables,
 * or edit the constants below.
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://gmpqbrvqyhvrjprynvse.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SERVICE_ROLE_KEY) {
  console.error(
    "Set SUPABASE_SERVICE_ROLE_KEY env var (found in Supabase Dashboard > Settings > API > service_role)"
  );
  process.exit(1);
}

interface DemoAccount {
  email: string;
  password: string;
  displayName: string;
  role: "tutor" | "student";
}

const ACCOUNTS: DemoAccount[] = [
  // Tutors
  { email: "demo@livesesh.app", password: "DemoPass123!", displayName: "Kim", role: "tutor" },
  { email: "tutor2@livesesh.app", password: "DemoPass123!", displayName: "Nick", role: "tutor" },
  // Students
  { email: "demo-student@livesesh.app", password: "DemoPass123!", displayName: "Sarah Chen", role: "student" },
  { email: "student-alex@livesesh.app", password: "DemoPass123!", displayName: "Alex Rivera", role: "student" },
  { email: "student-jordan@livesesh.app", password: "DemoPass123!", displayName: "Jordan Patel", role: "student" },
  { email: "student-casey@livesesh.app", password: "DemoPass123!", displayName: "Casey Kim", role: "student" },
  { email: "student-morgan@livesesh.app", password: "DemoPass123!", displayName: "Morgan Davis", role: "student" },
];

async function createUser(account: DemoAccount): Promise<void> {
  const url = `${SUPABASE_URL}/auth/v1/admin/users`;
  const body = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      display_name: account.displayName,
      role: account.role,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`  Created: ${account.email} (${account.displayName}) -> ${data.id}`);
  } else if (response.status === 422) {
    console.log(`  Exists:  ${account.email} (${account.displayName})`);
  } else {
    const text = await response.text();
    console.error(`  FAILED:  ${account.email} -> ${response.status}: ${text}`);
  }
}

async function main() {
  console.log(`Seeding ${ACCOUNTS.length} demo accounts to ${SUPABASE_URL}\n`);

  for (const account of ACCOUNTS) {
    await createUser(account);
  }

  console.log("\nDone. Demo accounts are ready.");
}

main().catch(console.error);
