import PaymentCompletion from "../../../components/PaymentCompletion";

export const metadata = {
  title: "Pago completado | Baremia",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  return <PaymentCompletion sessionId={params.session_id?.trim() ?? ""} />;
}
