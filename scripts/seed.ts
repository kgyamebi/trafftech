import { addDays, accraToday } from "../src/domain/dates";
import { signup, addVehicle, addDocument } from "../src/server/accounts";
import { dataDir, updateDatabase } from "../src/server/store";

async function main() {
  const dir = dataDir();
  const today = accraToday(new Date());
  const user = await signup(dir, {
    name: "Dev Driver",
    email: "dev@nokware.test",
    password: "development-only",
  });
  await updateDatabase(dir, (db) => {
    const row = db.users.find((u) => u.id === user.id);
    if (!row) return;
    row.dataClass = "DEVELOPMENT";
    row.onboardingCompleted = true;
    row.role = "admin";
  });
  const vehicle = await addVehicle(dir, user.id, {
    plate: "DEV 1000-26",
    make: "Development",
    model: "Fixture",
    year: "2020",
    colour: "Grey",
  });
  await updateDatabase(dir, (db) => {
    const row = db.vehicles.find((v) => v.id === vehicle.id);
    if (row) row.dataClass = "DEVELOPMENT";
  });
  await addDocument(dir, user.id, {
    vehicleId: vehicle.id,
    kind: "insurance",
    label: "Development insurance",
    expiresOn: addDays(today, 40),
    note: "DEVELOPMENT DATA. Not a real policy.",
  });
  console.log("Development account: dev@nokware.test / development-only");
  console.log("Labelled DEVELOPMENT. Separate from demo and from real signups.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
