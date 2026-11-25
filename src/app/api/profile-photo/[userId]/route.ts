import { getCurrentUser } from "@/lib/session";
import {
  canViewProfilePhoto,
  getProfilePhoto,
  isUserId,
} from "@/lib/profile-photo";
import { getUserTwoFactor, userNeedsTwoFactor } from "@/lib/two-factor";

type Params = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await params;
  if (!isUserId(userId)) {
    return new Response("Not found", { status: 404 });
  }

  const viewer = await getCurrentUser();
  if (!viewer) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Same mandatory 2FA enrollment as pages / server actions (API cannot redirect).
  const flags = await getUserTwoFactor(viewer.id);
  if (!flags || !userNeedsTwoFactor(flags)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!(await canViewProfilePhoto(viewer.id, userId))) {
    return new Response("Not found", { status: 404 });
  }

  const photo = await getProfilePhoto(userId);
  if (!photo) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(photo.bytes), {
    status: 200,
    headers: {
      "Content-Type": photo.content_type,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(photo.bytes.length),
    },
  });
}
