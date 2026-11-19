import { getPrintData } from "@/db/queries/print";
import { requireUser } from "@/lib/auth/session";
import { isMonth, monthLabel } from "@/lib/dates/calendar";
import { applyLayout } from "@/lib/print/sheet";
import { sheetToXlsx } from "@/lib/print/xlsx";

/** "Export .xlsx": the month's sheet, as laid out in the editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ month: string }> }) {
  await requireUser();
  const { month } = await params;
  if (!isMonth(month)) return new Response("Not found", { status: 404 });

  const data = await getPrintData(month);
  const title = `Public Witnessing Schedule - ${monthLabel(month)}`;
  const file = await sheetToXlsx(applyLayout(data.sheet, data.layout), data.settings, title);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${title}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
