import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply, gameUser, readGameJson } from "@/lib/science-games/server-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await readGameJson(request);
    const user = await gameUser(request);
    return gameReply(await getGameRepository().ensureAccountProfile(user.id, user.name));
  } catch (error) { return gameError(error); }
}
