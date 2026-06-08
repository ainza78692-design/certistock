# Extraction Pipeline

The recommended production flow is:

```text
PDF upload
-> Supabase Storage
-> unpdf embedded/selectable text extraction
-> PaddleOCR fallback when embedded text is weak
-> OpenRouter JSON structuring
-> strict schema validation
-> deterministic product normalization
-> product_aliases lookup
-> confidence scoring
-> human review
-> approval creates stock lots and stock ledger entries
```

## OCR

PaddleOCR is the primary OCR path. The OCR worker runs separately from Supabase Edge Functions because Python OCR models and PDF rendering are too heavy for the Edge runtime.

Surya is not active yet. Add it later only if PaddleOCR fails on real TC PDFs because of reading order, layout, or table extraction issues.

Tesseract is not used.

## AI Structuring

OpenRouter is the primary AI structuring provider. It receives extracted text, not raw stock decisions.

Default model:

```text
openrouter/free
```

A stronger specific model can be configured later with:

```text
OPENROUTER_MODEL
```

Gemini is optional and only used when confidence is very low and `GEMINI_API_KEY` exists.

## Safety Rule

OCR and AI never create stock directly.

They only pre-fill the review form. Stock lots and stock ledger entries are created only after the user clicks approve.
