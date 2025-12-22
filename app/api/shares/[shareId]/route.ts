import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ shareId: string }>;
};

const normalizeEmail = (email?: string | null) =>
  email ? email.trim().toLowerCase() : "";

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shareId } = await params;

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            profile: true,
            goals: { include: { keyResults: true } },
            productivityRatings: true,
            weeklyNotes: true,
          },
        },
        recipientUser: { select: { id: true, email: true } },
      },
    });

    if (!share || share.revokedAt) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const viewerEmail = normalizeEmail(session.user.email);
    const recipientEmail = normalizeEmail(share.recipientEmail);
    const isOwner = viewerEmail === normalizeEmail(share.owner.email);
    const isRecipient = viewerEmail === recipientEmail;

    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ownerProfile = share.owner.profile;
    const productivityRatings = Object.fromEntries(
      share.owner.productivityRatings.map((rating) => [rating.key, rating.rating])
    );
    const weeklyNotes = Object.fromEntries(
      share.owner.weeklyNotes.map((note) => [
        note.weekKey,
        {
          content: note.content ?? "",
          dos: note.dos ?? "",
          donts: note.donts ?? "",
        },
      ])
    );

    return NextResponse.json({
      share: {
        id: share.id,
        owner: {
          id: share.owner.id,
          email: share.owner.email,
          personName: ownerProfile?.personName ?? "",
        },
        profile: {
          weekStartDay: ownerProfile?.weekStartDay ?? 1,
          goalsSectionTitle: ownerProfile?.goalsSectionTitle ?? "Goals",
          productivityViewMode: ownerProfile?.productivityViewMode ?? "week",
          productivityScaleMode: ownerProfile?.productivityScaleMode ?? "3",
          showLegend: ownerProfile?.showLegend ?? true,
        },
        goals: share.owner.goals ?? [],
        productivityRatings,
        weeklyNotes,
      },
    });
  } catch (error) {
    console.error("Error fetching share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shareId } = await params;

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      select: { owner: { select: { email: true } }, ownerId: true },
    });

    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    if (normalizeEmail(share.owner.email) !== normalizeEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.share.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking share:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
