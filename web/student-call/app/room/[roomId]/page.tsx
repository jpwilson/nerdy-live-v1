import { RoomClientPage } from "@/components/room-client";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  return <RoomClientPage roomId={decodeURIComponent(roomId)} />;
}
