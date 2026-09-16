"""QA dos dois PDFs fictícios após export-protocol-previews.ts + WeasyPrint.
Requer pdfplumber. Não lê dados clínicos nem o PDF de referência.
"""
import json
import re
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[1]
results = []
for name, expected_patient, other_patient, meals in [
    ('curto', 'Paciente Fictícia Aurora', 'Paciente Ficticio Bento', 2),
    ('extenso', 'Paciente Ficticio Bento', 'Paciente Fictícia Aurora', 7),
]:
    path = root / 'output/pdf' / f'protocolo-{name}-ficticio.pdf'
    with pdfplumber.open(path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)
        assert expected_patient in text and other_patient not in text
        assert not re.search(r'roselys|bonaci', text, re.I)
        assert sum(len(p.images) for p in pdf.pages) == 2
        for number, page in enumerate(pdf.pages, 1):
            assert abs(page.width - 595.276) < .1 and abs(page.height - 841.89) < .1
            lines = (page.extract_text() or '').splitlines()
            assert lines[-1] == f'Página {number} de {len(pdf.pages)}'
            words = page.extract_words()
            # Footer belongs to the page margin; all clinical text must fit its content box.
            body = [w for w in words if w['top'] < page.height - 38]
            assert all(w['x0'] >= 44 and w['x1'] <= page.width - 44 for w in body), (name, number, 'horizontal overflow')
            assert all(w['top'] >= 45 and w['bottom'] <= page.height - 48 for w in body), (name, number, 'vertical overflow')
            # A section/meal heading cannot be the final clinical text on a page.
            assert not re.fullmatch(r'(?:Refeição|Comida) \d+(?: · Líquida)?', lines[-2])
        for meal in range(1, meals + 1):
            assert f'{"Refeição" if name == "curto" else "Comida"} {meal}' in text
        if name == 'curto':
            for time in ['07:35', '21:25', '09:00', '17:30', '06:20', '22:40']:
                assert time in text
            assert 'Meta calórica' not in text
        else:
            assert '20:45' in text and '06:45' in text
            assert '2.173 kcal/día' in text
            for row in range(1, 45):
                assert f'Grupo ficticio {row}' in text, ('missing table row', row)
            substitution_pages = [p for p in pdf.pages if 'Grupo ficticio ' in (p.extract_text() or '')]
            assert len(substitution_pages) >= 2
            assert all('Opción registrada' in (p.extract_text() or '') for p in substitution_pages)
        results.append({'document': name, 'pages': len(pdf.pages), 'meals': meals, 'logo_instances': 2, 'a4': True, 'margins': 'ok', 'content': 'ok'})
print(json.dumps(results, ensure_ascii=False, indent=2))
