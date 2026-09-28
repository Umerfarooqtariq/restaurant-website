import { hashSync } from "bcryptjs";

const password = process.argv[2] ?? "";

if (password.length < 10) {
  console.error('Usage: npm run hash-password -- "a-long-password"');
  console.error("Use at least 10 characters.");
  process.exit(1);
}

console.log(hashSync(password, 12));
