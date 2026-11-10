"""Preserve uploaded pages; append a clearly identified internal sign-off page."""
import io
from xml.sax.saxutils import escape
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from services.patient_card import register_pdf_fonts


def normalise_document(data: bytes, filename: str) -> bytes:
    if len(data) > 10 * 1024 * 1024 or not data:
        raise ValueError("Document must be between 1 byte and 10 MB")
    if data.startswith(b"%PDF-"):
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 100:
            raise ValueError("Use an unencrypted PDF with 1–100 pages")
        return data
    from PIL import Image, ImageOps
    original = Image.open(io.BytesIO(data))
    if original.format not in ("JPEG", "PNG", "WEBP") or original.width * original.height > 30_000_000:
        raise ValueError("Use PDF, JPG, PNG or WEBP")
    image = ImageOps.exif_transpose(original)
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PDF", resolution=150)
    return output.getvalue()


def signed_document(original: bytes, *, doc_id: str, patient_id: str, encounter_ref: str, signer: str,
                    signed_at: str, document_at: str, digest: str, note: str) -> bytes:
    font, bold = register_pdf_fonts()
    body = ParagraphStyle("DocBody", fontName=font, fontSize=9, leading=14, textColor=colors.HexColor("#243447"))
    title = ParagraphStyle("DocTitle", parent=body, fontName=bold, fontSize=17, leading=23, spaceAfter=14)
    small = ParagraphStyle("DocSmall", parent=body, fontSize=8, leading=12)
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=44, rightMargin=44, topMargin=42, bottomMargin=42)
    rows = [("Документ №", doc_id), ("ID пациента", patient_id), ("Обращение", encounter_ref),
            ("Дата документа", document_at), ("Подписал", signer), ("Подписано (UTC)", signed_at), ("Статус", "Подтверждено врачом")]
    table = Table([[Paragraph(escape(k), body), Paragraph(escape(v), body)] for k, v in rows], colWidths=[150, 357])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#CFDADF")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F6F7")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    story = [Paragraph("NeoOutcome AI", small), Paragraph("Лист врачебного подтверждения", title), table, Spacer(1, 18),
             Paragraph("Комментарий врача", body), Paragraph(escape(note or "Без комментария"), body), Spacer(1, 20),
             Paragraph("SHA-256 исходного PDF", body), Paragraph(escape(digest), small), Spacer(1, 14),
             Paragraph("Внутренняя электронная отметка системы. Не является квалифицированной ЭЦП. Исходные страницы документа сохранены; эта страница добавлена отдельно.", small)]
    document.build(story)
    writer = PdfWriter()
    for reader in (PdfReader(io.BytesIO(original)), PdfReader(io.BytesIO(buffer.getvalue()))):
        for page in reader.pages:
            writer.add_page(page)
    output = io.BytesIO(); writer.write(output)
    return output.getvalue()
