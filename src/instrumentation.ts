export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutopilot } = await import("@/lib/autopilot");
  startAutopilot();
}
