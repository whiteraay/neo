import base64
import io
import json
from types import SimpleNamespace
import pytest
from pydantic import SecretStr
from services import openai_labs


def report():
    return {"laboratory": "Uploaded laboratory", "specimen_date": "2026-07-25", "report_date": None,
            "observations": [{"code": "hb", "original_name": "HGB", "value": 124, "value_text": None, "unit": "g/L", "reference_range": "110–150", "source_line": "HGB 124 g/L 110–150"}],
            "summary": "Check the original values.", "questions": ["Discuss the report with your doctor."], "warnings": []}


def test_responses_payload_uses_actual_file_and_strict_schema(monkeypatch):
    monkeypatch.setattr(openai_labs, 'get_settings', lambda: SimpleNamespace(openai_api_key=SecretStr('test-key-not-real'), openai_model='gpt-4.1-mini'))
    captured = {}
    def send(request, timeout):
        captured.update(json.loads(request.data))
        return io.BytesIO(json.dumps({"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(report())}]}]}).encode())
    monkeypatch.setattr(openai_labs, 'urlopen', send)
    actual = b'%PDF-1.4 actual uploaded bytes'
    parsed = openai_labs.request_report(actual, 'application/pdf')
    assert parsed['observations'][0]['value'] == 124
    content = captured['input'][0]['content'][-1]
    assert base64.b64decode(content['file_data'].split(',', 1)[1]) == actual
    assert captured['store'] is False
    assert captured['text']['format']['strict'] is True
    assert 'hb' in captured['text']['format']['schema']['$defs']['Observation']['properties']['code']['enum']


def test_missing_key_and_incomplete_response_do_not_invent_results(monkeypatch):
    monkeypatch.setattr(openai_labs, 'get_settings', lambda: SimpleNamespace(openai_api_key=SecretStr(''), openai_model='gpt-4.1-mini'))
    with pytest.raises(openai_labs.AIError, match='OPENAI_API_KEY'):
        openai_labs.request_report(b'test', 'text/plain')
    monkeypatch.setattr(openai_labs, 'get_settings', lambda: SimpleNamespace(openai_api_key=SecretStr('test-key-not-real'), openai_model='gpt-4.1-mini'))
    monkeypatch.setattr(openai_labs, 'urlopen', lambda *a, **kw: io.BytesIO(b'{"status":"incomplete","output":[]}'))
    with pytest.raises(openai_labs.AIError):
        openai_labs.request_report(b'test', 'text/plain')
