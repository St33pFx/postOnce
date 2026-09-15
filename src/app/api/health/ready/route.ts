import "server-only";
import { probeDatabase } from "../../../../db/readiness";
import { readiness } from "../../../../modules/health/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => readiness(probeDatabase);
