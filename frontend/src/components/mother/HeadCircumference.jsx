/* Fetal head circumference from an ultrasound image: U-Net trained on HC18 (backend/ml/train_hc18.py).
   A sample from the held-out validation set shows the model next to the expert reference; her own image needs the pixel
   size printed by the scanner. The result can be saved to the timeline as HC. Research aid, not a measurement of record. */
import { useEffect, useRef, useState } from 'react';
import { ScanLine, Upload, Save, Info } from 'lucide-react';
import { Card, Badge } from '../../lib/ui.jsx';
import { useT } from '../../lib/i18n.jsx';
import { api } from '../../services/api.js';

export default function HeadCircumference({ onSaved }) {
  const { lang } = useT(); const L = (ru, en, kz) => ({ ru, en, kz })[lang] || ru;
  const [info, setInfo] = useState(null); const [samples, setSamples] = useState([]); const [sample, setSample] = useState('');
  const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [pixel, setPixel] = useState(''); const [file, setFile] = useState(null);
  const today = new Date().toLocaleDateString('en-CA'); const [date, setDate] = useState(today); const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);
  const run = async (args) => { setBusy(true); setError(''); setSaved(false); try { setRes(await api.hcMeasure(args)); } catch (e) { setRes(null); setError(e.detail?.code ? errText(e.detail.code) : e.message); } finally { setBusy(false); } };
  const errText = (c) => ({ no_head: L('Голова плода не найдена на снимке.', 'No fetal head found in the image.', 'Суретте ұрық басы табылмады.'), not_image: L('Это не изображение.', 'This is not an image.', 'Бұл сурет емес.'),
    pixel_size: L('Размер пикселя должен быть 0,01–1 мм.', 'Pixel size must be 0.01–1 mm.', 'Пиксель өлшемі 0,01–1 мм болуы керек.'), model_missing: L('Модель не установлена на сервере.', 'The model is not installed on the server.', 'Модель серверде орнатылмаған.') })[c] || c;
  useEffect(() => {
    api.hcInfo().then((i) => {
      setInfo(i);
      if (i.ready) api.hcSamples().then((s) => { setSamples(s); if (s[0]) { setSample(s[0].filename); run({ sample: s[0].filename }); } }).catch(() => {});
    }).catch(() => setInfo({ ready: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (info && !info.ready) return null;
  const pickSample = (name) => { setSample(name); setFile(null); if (name) run({ sample: name }); };
  const pickFile = (f) => { if (!f) return; setFile(f); setSample(''); setRes(null); if (pixel) run({ file: f, pixelSize: parseFloat(pixel.replace(',', '.')) }); };
  const measureFile = () => file && run({ file, pixelSize: pixel ? parseFloat(pixel.replace(',', '.')) : null });
  const save = async () => { try { await api.addObservation({ code: 'hc', value: res.hc_mm, unit: 'mm', specimen_date: date }); setSaved(true); onSaved?.(); } catch (e) { setError(e.message); } };
  const diff = res?.reference_hc_mm != null && res?.hc_mm != null ? Math.round((res.hc_mm - res.reference_hc_mm) * 10) / 10 : null;
  const wk = (g) => L(`${Math.floor(g)} нед. ${Math.round((g % 1) * 7)} дн.`, `${Math.floor(g)} wk ${Math.round((g % 1) * 7)} d`, `${Math.floor(g)} апта ${Math.round((g % 1) * 7)} күн`);

  return <Card title={<span className="flex items-center gap-2"><ScanLine size={16} />{L('Окружность головы плода · ИИ', 'Fetal head circumference · AI', 'Ұрық басының шеңбері · ЖИ')}</span>}
    sub={info?.ready ? L(`U-Net, обучена на HC18 (${info.n_train} снимков). Проверка на ${info.n_val} новых снимках: средняя ошибка ${info.val_hc_mae_mm} мм, Dice ${info.val_dice}`, `U-Net trained on HC18 (${info.n_train} images). Held-out check on ${info.n_val}: mean error ${info.val_hc_mae_mm} mm, Dice ${info.val_dice}`, `HC18-де оқытылған U-Net (${info.n_train} сурет). ${info.n_val} жаңа суретте тексеру: орташа қате ${info.val_hc_mae_mm} мм, Dice ${info.val_dice}`) : ''}
    right={<Badge tone="moderate">{L('исследование', 'research', 'зерттеу')}</Badge>}>
    <div className="flex flex-wrap items-end gap-3">
      {samples.length > 0 && <label className="text-sm"><span className="muted block mb-1 text-xs">{L('Снимок из проверочной выборки', 'Image from the held-out set', 'Тексеру жиынындағы сурет')}</span>
        <select className="input py-1.5" value={sample} onChange={(e) => pickSample(e.target.value)}><option value="">—</option>{samples.map((s) => <option key={s.filename} value={s.filename}>{s.filename} · {L('эксперт', 'expert', 'сарапшы')} {s.reference_hc_mm} {L('мм', 'mm', 'мм')}</option>)}</select></label>}
      <label className="text-sm"><span className="muted block mb-1 text-xs">{L('Размер пикселя, мм (для своего снимка)', 'Pixel size, mm (for your image)', 'Пиксель өлшемі, мм (өз суретіңіз үшін)')}</span>
        <input className="input py-1.5 mono w-36" inputMode="decimal" placeholder="0,12" value={pixel} onChange={(e) => setPixel(e.target.value)} onBlur={measureFile} /></label>
      <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />{L('Свой снимок УЗИ', 'Your ultrasound image', 'Өз УДЗ суретіңіз')}</button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
    {busy && <p className="muted text-sm mt-3">{L('Анализ снимка…', 'Analysing the image…', 'Сурет талдануда…')}</p>}
    {error && <p role="alert" className="text-sm mt-3" style={{ color: '#C62828' }}>{error}</p>}
    {res && !busy && <div className="grid gap-4 mt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <img src={`data:image/png;base64,${res.overlay_png}`} alt={L('Снимок УЗИ с найденным контуром головы', 'Ultrasound image with the fitted head outline', 'Бас контуры белгіленген УДЗ суреті')} className="w-full rounded-xl border border-line bg-black" />
      <div className="grid gap-3 content-start">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Окружность головы (ИИ)', 'Head circumference (AI)', 'Бас шеңбері (ЖИ)')}</div><div className="text-2xl font-semibold mt-1 mono">{res.hc_mm != null ? `${res.hc_mm}` : `${res.hc_px} px`}<span className="text-sm muted ml-1">{res.hc_mm != null ? L('мм', 'mm', 'мм') : ''}</span></div></div>
          <div className="rounded-xl border border-line p-3"><div className="muted text-xs">{L('Срок по HC (Hadlock)', 'GA from HC (Hadlock)', 'HC бойынша мерзім (Hadlock)')}</div><div className="text-xl font-semibold mt-1">{res.ga_weeks != null ? wk(res.ga_weeks) : '—'}</div></div>
          {res.reference_hc_mm != null && <div className="rounded-xl border border-line p-3 col-span-2"><div className="muted text-xs">{L('Разметка эксперта (HC18)', 'Expert reference (HC18)', 'Сарапшы белгісі (HC18)')}</div><div className="text-lg font-semibold mt-1 mono">{res.reference_hc_mm} {L('мм', 'mm', 'мм')} <span className="text-sm muted">· {L('разница', 'difference', 'айырма')} {diff > 0 ? '+' : ''}{diff} {L('мм', 'mm', 'мм')}</span></div></div>}
        </div>
        {res.hc_mm == null && <p className="text-sm" style={{ color: '#B45309' }}>{L('Укажите размер пикселя (мм), чтобы получить окружность в миллиметрах.', 'Enter the pixel size (mm) to get the circumference in millimetres.', 'Миллиметрмен алу үшін пиксель өлшемін енгізіңіз.')}</p>}
        {res.hc_mm != null && res.hc_mm >= 50 && <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="muted block">{L('Дата УЗИ', 'Scan date', 'УДЗ күні')}</span><input type="date" className="input py-1.5" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <button type="button" className="btn btn-primary" disabled={saved} onClick={save}><Save size={14} />{saved ? L('Сохранено', 'Saved', 'Сақталды') : L('Сохранить в динамику', 'Save to trends', 'Динамикаға сақтау')}</button>
        </div>}
        <p className="muted text-xs flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{L('Контур — эллипс, подобранный к области головы, найденной моделью. Снимок обрабатывается в памяти и не сохраняется. Это не заменяет измерение врача УЗИ.', 'The outline is an ellipse fitted to the head region found by the model. The image is processed in memory and not stored. This does not replace the sonographer.', 'Контур — модель тапқан бас аймағына сәйкестендірілген эллипс. Сурет сақталмайды. Бұл УДЗ дәрігерінің өлшемін алмастырмайды.')}</p>
      </div>
    </div>}
    {info?.ready && <details className="mt-4"><summary className="cursor-pointer text-xs muted">{L('Данные и проверка модели', 'Data and model check', 'Деректер және модельді тексеру')}</summary>
      <div className="text-xs mt-2 grid gap-1">
        <div>{L('Обучающая выборка (training_set)', 'Training set', 'Оқыту жиыны')}: {info.n_train + info.n_val} {L('снимков с разметкой эксперта; ', 'expert-annotated images; ', 'сарапшы белгілеген сурет; ')}{info.n_val} ({L('10 % плодов', '10 % of fetuses', 'ұрықтардың 10 %')}) {L('отложено для проверки', 'held out for checking', 'тексеруге қалдырылды')}. HC {info.train_hc_mm.min}–{info.train_hc_mm.max} {L('мм', 'mm', 'мм')}.</div>
        <div>{L('Проверка', 'Check', 'Тексеру')}: {L('средняя ошибка', 'mean error', 'орташа қате')} {info.val_hc_mae_mm} {L('мм', 'mm', 'мм')}, {L('медиана', 'median', 'медиана')} {info.val_hc_median_ae_mm} {L('мм', 'mm', 'мм')}, {L('в пределах 3 мм', 'within 3 mm', '3 мм ішінде')}: {Math.round(info.val_within_3mm * 100)}%, Dice {info.val_dice}.</div>
        <div>{L('Тестовая выборка (test_set)', 'Test set', 'Тест жиыны')}: {info.n_test} {L('снимков без открытой разметки; модель измерила', 'images without public labels; the model measured', 'ашық белгісіз сурет; модель өлшеді')} {info.test_predicted}, HC {info.test_hc_mm.min}–{info.test_hc_mm.max} {L('мм', 'mm', 'мм')} ({L('медиана', 'median', 'медиана')} {Math.round(info.test_hc_mm.median)}).</div>
        <div className="muted">{info.source}</div>
      </div></details>}
  </Card>;
}
