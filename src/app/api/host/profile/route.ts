import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { forbiddenResponse, readJsonBody, requireUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/host/profile
 * Create or ensure a host profile exists for the user
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (body.userId && body.userId !== userId) return forbiddenResponse();

    // Check if host profile already exists
    const { data: existingHost, error: checkError } = await supabaseAdmin
      .from("host")
      .select("host_uuid, user_id")
      .eq("user_id", userId)
      .limit(1);

    if (checkError) {
      console.error("[POST /api/host/profile] Check error:", checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // If host profile exists, just return it
    if (existingHost && existingHost.length > 0) {
      return NextResponse.json({
        data: {
          hostUuid: existingHost[0].host_uuid,
          userId: existingHost[0].user_id,
          created: false,
        },
      });
    }

    // Create new host profile
    const { data: newHost, error: insertError } = await supabaseAdmin
      .from("host")
      .insert({ user_id: userId, is_verified: false })
      .select("host_uuid, user_id");

    if (insertError) {
      console.error("[POST /api/host/profile] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (!newHost || newHost.length === 0) {
      return NextResponse.json({ error: "Failed to create host profile" }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        hostUuid: newHost[0].host_uuid,
        userId: newHost[0].user_id,
        created: true,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/host/profile] Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;
    const body = await readJsonBody(req);
    if (body instanceof NextResponse) return body;
    if (body.userId && body.userId !== userId) return forbiddenResponse();
    const about = typeof body.about === "string" ? body.about : "";
    if (about.length > 2000) {
      return NextResponse.json({ error: "About must be 2000 characters or fewer." }, { status: 400 });
    }

    // Update the host's about section
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from("host")
      .update({ about: about?.trim() || null })
      .eq("user_id", userId)
      .select("host_uuid, about, is_verified");

    if (updateError) {
      console.error("[PATCH /api/host/profile] Update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updateData || updateData.length === 0) {
      return NextResponse.json({ error: "Host profile not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      data: { 
        success: true, 
        about: updateData[0].about,
        hostUuid: updateData[0].host_uuid,
        isVerified: updateData[0].is_verified,
      } 
    });
  } catch (err: any) {
    console.error("[PATCH /api/host/profile] Exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
