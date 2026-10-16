import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, BarChart3,
  BrainCircuit, Check, CheckCircle2, ChevronRight, CircleHelp,
  Database, FileSpreadsheet, Github, Info, LayoutDashboard,
  Menu, RefreshCw, RotateCcw, ShieldCheck, Sparkles, UploadCloud,
  Users, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from './api.js';
import { COLUMNS, TEMPLATE, downloadCSV, exportCSV, parseCustomers } from './csv.js';

const START = {
  tenure: '24', monthly_charges: '79.5', senior_citizen: '0',
  contract: 'Month-to-month', internet_service: 'Fiber optic',
  payment_method: 'Electronic check', tech_support: 'No',
  online_security: 'No', paperless_billing: 'Yes',
};
const CONTRACTS = ['Month-to-month', 'One year', 'Two year'];
const INTERNET = ['DSL', 'Fiber optic', 'No'];
const PAYMENTS = ['Bank transfer (automatic)', 'Credit card (automatic)', 'Electronic check', 'Mailed check'];
const SUPPORT = ['No', 'Yes', 'No internet service'];
const YES_NO = ['No', 'Yes'];
const TABS = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'predict', icon: BrainCircuit, label: 'Single prediction' },
  { id: 'batch', icon: Users, label: 'Batch predictions' },
  { id: 'performance', icon: BarChart3, label: 'Model performance' },
];
const METRICS = [
  { key: 'accuracy', label: 'Accuracy', description: 'Overall test correctness', icon: CheckCircle2 },
  { key: 'roc_auc', label: 'ROC-AUC', description: 'Ranking discrimination', icon: Activity },
  { key: 'recall', label: 'Recall', description: 'Churn cases found', icon: Users },
  { key: 'f1', label: 'F1-score', description: 'Precision / recall balance', icon: BarChart3 },
];

function Percent({ value, digits = 1 }) {
  return value === undefined || value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}

function SectionHeading({ eyebrow, title, description, right }) {
  return <div className="section-heading">
    <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>
    {right && <div className="section-right">{right}</div>}
  </div>;
}

function SelectField({ label, id, value, onChange, options, hint }) {
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
    {hint && <small>{hint}</small>}
  </div>;
}

function NumberField({ label, id, value, onChange, min, max, step = '1', suffix }) {
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className="input-wrap">
      <input id={id} type="number" min={min} max={max} step={step} required
        value={value} onChange={(e) => onChange(e.target.value)} />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  </div>;
}

function RiskRing({ probability, high }) {
  const value = Math.min(Math.max(probability * 100, 0), 100);
  const tone = high ? '#e28d44' : '#12aa83';
  return <div className="risk-ring" style={{ '--risk-color': tone, '--risk-percent': `${value}%` }}>
    <div className="risk-ring-inner">
      <span className="ring-overline">ESTIMATED RISK</span>
      <strong>{value.toFixed(1)}%</strong>
      <span className="ring-under">Churn probability</span>
    </div>
  </div>;
}

function EmptyState({ icon: Icon, title, body }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{body}</p></div>;
}

function MetricCard({ metric, value }) {
  const Icon = metric.icon;
  return <div className="metric-card">
    <div className="metric-top"><span>{metric.label}</span><span className="metric-icon"><Icon size={17}/></span></div>
    <div className="metric-value"><Percent value={value} digits={2}/></div>
    <p>{metric.description}</p>
    <span className="metric-foot"><span className="mini-circle" /> Held-out test set</span>
  </div>;
}

function MetricChart({ metrics }) {
  if (!metrics) return <EmptyState icon={BarChart3} title="No model metrics yet" body="Start the API and train the model to load evaluation results."/>;
  const data = [
    { metric: 'Accuracy', percent: metrics.accuracy * 100 },
    { metric: 'Precision', percent: metrics.precision * 100 },
    { metric: 'Recall', percent: metrics.recall * 100 },
    { metric: 'F1-score', percent: metrics.f1 * 100 },
    { metric: 'ROC-AUC', percent: metrics.roc_auc * 100 },
  ];
  return <div className="chart-container" role="img" aria-label="Bar chart of model evaluation metrics">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 22, bottom: 6, left: 12 }}>
        <CartesianGrid strokeDasharray="4 6" horizontal={false} stroke="#edf0f4" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: '#94a0b2', fontSize: 12 }} />
        <YAxis type="category" dataKey="metric" width={74} axisLine={false} tickLine={false} tick={{ fill: '#5c6878', fontSize: 12, fontWeight: 600 }} />
        <Tooltip cursor={{ fill: '#f6f8fb' }} formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Score']} contentStyle={{ borderRadius: 12, border: '1px solid #e7edf1', boxShadow: '0 8px 35px #17294115' }} />
        <Bar dataKey="percent" radius={[0, 7, 7, 0]} maxBarSize={21}>
          {data.map((item) => <Cell key={item.metric} fill={item.metric === 'Recall' ? '#e7a26c' : '#30b9a1'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

function ConfusionMatrix({ matrix }) {
  if (!Array.isArray(matrix) || matrix.length !== 2) return <EmptyState icon={Database} title="Matrix unavailable" body="No test-set confusion matrix found."/>;
  const tn = matrix[0]?.[0], fp = matrix[0]?.[1], fn = matrix[1]?.[0], tp = matrix[1]?.[1];
  return <div className="confusion-wrap">
    <div className="matrix-label-top">PREDICTED</div>
    <div className="matrix-head"><span></span><span>Stay</span><span>Churn</span></div>
    <div className="matrix-row"><span className="matrix-axis">Actual stay</span><div className="matrix-cell is-correct"><strong>{tn}</strong><small>True negative</small></div><div className="matrix-cell is-wrong"><strong>{fp}</strong><small>False positive</small></div></div>
    <div className="matrix-row"><span className="matrix-axis">Actual churn</span><div className="matrix-cell is-wrong"><strong>{fn}</strong><small>Missed churn</small></div><div className="matrix-cell is-correct"><strong>{tp}</strong><small>True positive</small></div></div>
    <p className="matrix-note">Actual test labels vs predictions at the saved model threshold.</p>
  </div>;
}

function Sidebar({ active, setActive, close }) {
  function move(id) {
    setActive(id);
    close();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return <>
    <div className="brand"><div className="brand-mark"><Activity size={22} strokeWidth={2.7}/></div><div><strong>churn<span>IQ</span></strong><small>ML INTELLIGENCE PLATFORM</small></div></div>
    <div className="sidebar-separator"/>
    <div className="nav-label">WORKSPACE</div>
    <nav className="side-nav" aria-label="Primary navigation">
      {TABS.map(({ id, icon: Icon, label }) => <button key={id} type="button" onClick={() => move(id)} className={active === id ? 'side-link active' : 'side-link'}>
        <Icon size={18}/><span>{label}</span>{active === id && <span className="nav-dot"/>}
      </button>)}
    </nav>
    <div className="sidebar-bottom"><div className="sidebar-note"><Sparkles size={18}/><strong>Built for learning.</strong><p>Explore how a trained ML model becomes a usable application.</p></div><a href="https://github.com/SinanKC35/ml_api_project" target="_blank" rel="noreferrer" className="github-link"><Github size={17}/> View GitHub repository <ArrowRight size={15}/></a></div>
  </>;
}

export default function App() {
  const [active, setActive] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [online, setOnline] = useState('checking');
  const [connectionError, setConnectionError] = useState('');
  const [form, setForm] = useState(START);
  const [prediction, setPrediction] = useState(null);
  const [pending, setPending] = useState(false);
  const [predictError, setPredictError] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileRows, setFileRows] = useState([]);
  const [fileError, setFileError] = useState('');
  const [batch, setBatch] = useState(null);
  const [batchPending, setBatchPending] = useState(false);
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    setOnline('checking');
    setConnectionError('');
    try {
      const [, metadata] = await Promise.all([api('/ready'), api('/model-info')]);
      setInfo(metadata);
      setOnline('online');
    } catch (error) {
      setOnline('offline');
      setInfo(null);
      setConnectionError(error.message);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const setField = (key, value) => {
    if (key === 'internet_service') {
      setForm((prev) => ({
        ...prev, internet_service: value,
        tech_support: value === 'No' ? 'No internet service' : (prev.tech_support === 'No internet service' ? 'No' : prev.tech_support),
        online_security: value === 'No' ? 'No internet service' : (prev.online_security === 'No internet service' ? 'No' : prev.online_security),
      }));
    } else setForm((prev) => ({ ...prev, [key]: value }));
    setPrediction(null);
    setPredictError('');
  };

  const submitPrediction = async (e) => {
    e.preventDefault();
    setPredictError('');
    setPrediction(null);
    setPending(true);
    try {
      const result = await api('/predict', { method: 'POST', body: JSON.stringify({
        ...form,
        tenure: Number(form.tenure),
        monthly_charges: Number(form.monthly_charges),
        senior_citizen: Number(form.senior_citizen),
      }) });
      setPrediction(result);
    } catch (error) { setPredictError(error.message); }
    finally { setPending(false); }
  };

  const uploadCSV = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError(''); setBatch(null); setFileRows([]); setFileName('');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('File too large. Maximum size: 2 MB.');
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.');
      const rows = parseCustomers(await file.text());
      setFileName(file.name);
      setFileRows(rows);
    } catch (error) { setFileError(error.message); }
    event.target.value = '';
  };

  const runBatch = async () => {
    if (!fileRows.length) return;
    setBatchPending(true); setBatch(null); setFileError('');
    try {
      const result = await api('/predict-batch', {
        method: 'POST', body: JSON.stringify({ customers: fileRows }),
      });
      setBatch(result);
    } catch (error) { setFileError(error.message); }
    finally { setBatchPending(false); }
  };

  const saveBatch = () => {
    if (!batch) return;
    const rows = fileRows.map((row, i) => [
      ...COLUMNS.map((key) => row[key]),
      batch.results[i].prediction,
      batch.results[i].probability,
      batch.results[i].message,
    ]);
    downloadCSV('churn_predictions_v3.csv', exportCSV([...COLUMNS, 'prediction', 'churn_probability', 'risk_label'], rows));
  };
  const metrics = info?.metrics_test_set;
  const cm = metrics?.confusion_matrix;
  const testChurnCases = cm ? cm[1][0] + cm[1][1] : null;
  const totalTestCases = cm ? cm.flat().reduce((sum, n) => sum + n, 0) : null;
  const supportOptions = form.internet_service === 'No' ? ['No internet service'] : ['No', 'Yes'];

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}><Sidebar active={active} setActive={setActive} close={() => setMobileOpen(false)}/></aside>
    <main className="main-content">
      <div className="topbar">
        <div className="topbar-heading"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21}/></button><span>Workspace</span><ChevronRight size={15}/><strong>Dashboard overview</strong></div>
        <div className="topbar-actions"><span className={`connection ${online}`}><span className="connection-dot"/>{online === 'online' ? 'Model connected' : online === 'checking' ? 'Connecting...' : 'Model offline'}</span><button className="icon-button" onClick={refresh} title="Refresh connection" aria-label="Refresh connection"><RefreshCw size={17}/></button><span className="top-avatar">SK</span></div>
      </div>
      <div className="content-area">
        <section id="overview" className="top-section">
          <div className="page-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> MACHINE LEARNING / CUSTOMER ANALYTICS</span><h1>Customer churn, <em>made clear.</em></h1><p>Predict customer retention risk with a trained XGBoost model. Explore the evaluation, run a prediction, or process customer CSV files.</p></div><span className="version-chip"><ShieldCheck size={15}/> Educational demo · v3</span></div>
          {connectionError && <div className="alert error"><AlertCircle size={19}/><span><strong>Model service unavailable.</strong> {connectionError} <span className="alert-note">You can still explore the interface, but live predictions need the API.</span></span><button type="button" className="text-button" onClick={refresh}>Retry</button></div>}
          <div className="hero">
            <div className="hero-copy"><div className="hero-tag"><Sparkles size={14}/> POWERED BY XGBOOST</div><h2>Understand who's at risk of leaving.</h2><p>From structured customer data to an actionable risk estimate — powered by the real trained model in your FastAPI backend.</p><button className="btn white-btn" onClick={() => document.getElementById('predict')?.scrollIntoView({ behavior: 'smooth' })}>Try live prediction <ArrowRight size={17}/></button></div>
            <div className="hero-visual" aria-hidden="true"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-circle"><Activity size={67} strokeWidth={1.5}/></div><span className="hero-orbit-dot dot-one"/><span className="hero-orbit-dot dot-two"/><div className="hero-float floating-one"><span className="spark-dot green"/>Model inference</div><div className="hero-float floating-two"><BarChart3 size={17}/> Data-driven insights</div></div>
          </div>
          <div className="metric-grid">{METRICS.map((metric) => <MetricCard key={metric.key} metric={metric} value={metrics?.[metric.key]}/>)}</div>
          <div className="explanation-line"><Info size={15}/><span>Metrics come from one held-out test set of {info?.test_rows?.toLocaleString('en-US') || '—'} customers, not from the uploaded CSV or real-world production usage.</span></div>
        </section>

        <section id="predict" className="content-section">
          <SectionHeading eyebrow="01 / MODEL INFERENCE" title="Live churn prediction" description="Enter a customer's details to receive a risk estimate from your FastAPI API." right={<span className="small-pill"><span className="mini-circle"/> Real model inference</span>}/>
          <div className="prediction-layout">
            <div className="panel form-panel"><div className="panel-header"><div className="panel-title"><span className="panel-icon"><Users size={18}/></span><div><h3>Customer details</h3><p>9 validated features from the training dataset</p></div></div><button className="reset-button" onClick={() => {setForm(START);setPrediction(null);setPredictError('');}}><RotateCcw size={14}/> Reset</button></div>
              <form onSubmit={submitPrediction}>
                <div className="form-grid">
                  <NumberField label="Tenure" id="tenure" value={form.tenure} onChange={(v) => setField('tenure', v)} min={0} max={120} suffix="months" />
                  <NumberField label="Monthly charges" id="monthly_charges" value={form.monthly_charges} onChange={(v) => setField('monthly_charges', v)} min={0} max={250} step="0.01" suffix="USD" />
                  <SelectField label="Contract type" id="contract" value={form.contract} onChange={(v) => setField('contract', v)} options={CONTRACTS}/>
                  <SelectField label="Internet service" id="internet_service" value={form.internet_service} onChange={(v) => setField('internet_service', v)} options={INTERNET}/>
                  <SelectField label="Payment method" id="payment_method" value={form.payment_method} onChange={(v) => setField('payment_method', v)} options={PAYMENTS}/>
                  <SelectField label="Senior citizen" id="senior_citizen" value={form.senior_citizen} onChange={(v) => setField('senior_citizen', v)} options={['0', '1']}/>
                  <SelectField label="Tech support" id="tech_support" value={form.tech_support} onChange={(v) => setField('tech_support', v)} options={supportOptions}/>
                  <SelectField label="Online security" id="online_security" value={form.online_security} onChange={(v) => setField('online_security', v)} options={supportOptions}/>
                  <SelectField label="Paperless billing" id="paperless_billing" value={form.paperless_billing} onChange={(v) => setField('paperless_billing', v)} options={YES_NO}/>
                </div>
                {predictError && <div className="alert error compact"><AlertCircle size={17}/><span>{predictError}</span></div>}
                <div className="form-footer"><span><Info size={15}/> Uses trained model v{info?.model_version || '—'}</span><button className="btn primary-btn" type="submit" disabled={pending || online !== 'online'}>{pending ? 'Analyzing…' : 'Predict churn risk'}<ArrowRight size={17}/></button></div>
              </form>
            </div>
            <div className="panel result-panel"><div className="panel-header"><div className="panel-title"><span className="panel-icon"><BrainCircuit size={18}/></span><div><h3>Prediction result</h3><p>Live output from the XGBoost classifier</p></div></div></div>
              {prediction ? <div className="prediction-view"><RiskRing probability={prediction.probability} high={prediction.prediction === 1}/><span className={`risk-badge ${prediction.prediction ? 'high' : 'low'}`}><span className="connection-dot"/>{prediction.message}</span><p className="risk-description">At the saved {(100 * (info?.threshold ?? 0.5)).toFixed(0)}% threshold, this customer is predicted to <strong>{prediction.prediction ? 'churn' : 'stay'}</strong>.</p><div className="risk-detail"><span>Predicted class</span><strong>{prediction.prediction} · {prediction.prediction ? 'Churn' : 'Stay'}</strong></div><div className="risk-detail"><span>Model version</span><strong>{prediction.model_version}</strong></div><div className="disclaimer"><CircleHelp size={16}/>Probabilities are not calibrated and are not a guarantee of customer behavior.</div></div> : <EmptyState icon={Activity} title="Ready when you are" body="Fill in the details and click Predict churn risk to see your model's response here."/>}
            </div>
          </div>
        </section>

        <section id="batch" className="content-section">
          <SectionHeading eyebrow="02 / BULK INFERENCE" title="Batch predictions" description="Upload a CSV file and predict churn for up to 500 customers at once. Data is processed by your local API." right={<button type="button" className="subtle-button" onClick={() => downloadCSV('customer_template.csv', TEMPLATE)}><ArrowDownToLine size={16}/> Download template</button>}/>
          <div className="panel upload-panel"><div className="upload-card" onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => {if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();}} tabIndex={0} role="button" aria-label="Select CSV file"><input type="file" accept=".csv,text/csv" ref={fileInputRef} onChange={uploadCSV} className="visually-hidden"/><div className="upload-icon"><UploadCloud size={28}/></div><h3>{fileName || 'Drop in your customer data'}</h3><p>{fileRows.length ? `${fileRows.length} valid rows loaded · Ready for prediction` : 'Select a CSV with the 9 customer columns. 500 rows max · 2 MB max.'}</p><span className="upload-action">{fileName ? 'Choose a different file' : 'Browse CSV files'} <ArrowRight size={15}/></span></div>
            {fileError && <div className="alert error compact"><AlertCircle size={17}/>{fileError}</div>}
            {fileRows.length > 0 && <><div className="batch-header"><div><strong>Preview</strong><span>Showing first {Math.min(fileRows.length, 5)} of {fileRows.length} customers</span></div><button className="btn primary-btn" type="button" disabled={batchPending || online !== 'online'} onClick={runBatch}>{batchPending ? 'Processing…' : 'Run batch predictions'} <ArrowRight size={17}/></button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>#</th><th>Tenure</th><th>Monthly ($)</th><th>Contract</th><th>Internet</th></tr></thead><tbody>{fileRows.slice(0, 5).map((row, index) => <tr key={index}><td>{index + 1}</td><td>{row.tenure} mo.</td><td>${row.monthly_charges.toFixed(2)}</td><td>{row.contract}</td><td>{row.internet_service}</td></tr>)}</tbody></table></div></>}
          </div>
          {batch && <div className="panel batch-results"><div className="panel-header"><div className="panel-title"><span className="panel-icon"><FileSpreadsheet size={18}/></span><div><h3>Batch results</h3><p>Predictions for your uploaded file, not ground-truth churn outcomes</p></div></div><button className="subtle-button" onClick={saveBatch}><ArrowDownToLine size={16}/> Export results</button></div><div className="batch-summary"><div><span>Customers analyzed</span><strong>{batch.total}</strong></div><div><span>Predicted higher risk</span><strong className="amber-text">{batch.high_risk}</strong></div><div><span>Predicted lower risk</span><strong className="green-text">{batch.low_risk}</strong></div></div><div className="stacked-bar"><span className="bar-high" style={{width: `${100 * batch.high_risk / batch.total}%`}}/><span className="bar-low" style={{width: `${100 * batch.low_risk / batch.total}%`}}/></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Contract</th><th>Risk estimate</th><th>Prediction</th></tr></thead><tbody>{batch.results.slice(0, 8).map((row, index) => <tr key={index}><td>#{index + 1}</td><td>{fileRows[index].contract}</td><td><strong>{(row.probability * 100).toFixed(1)}%</strong></td><td><span className={`table-risk ${row.prediction ? 'high' : 'low'}`}>{row.prediction ? 'Higher risk' : 'Lower risk'}</span></td></tr>)}</tbody></table></div>{batch.results.length > 8 && <p className="table-footer">Showing 8 rows. Export the CSV to view all {batch.total} results.</p>}</div>}
        </section>

        <section id="performance" className="content-section performance-section">
          <SectionHeading eyebrow="03 / VALIDATION & INSIGHTS" title="Model performance" description="Transparent evaluation results from the hold-out test set; not claims about live production accuracy." right={<span className="small-pill"><Database size={14}/> {info?.test_rows?.toLocaleString('en-US') || '—'} test records</span>}/>
          <div className="insight-grid"><div className="panel insights-panel"><div className="panel-header"><div className="panel-title"><span className="panel-icon"><BarChart3 size={18}/></span><div><h3>Evaluation metrics</h3><p>Scores across five metrics · 0–100% scale</p></div></div></div><MetricChart metrics={metrics}/></div><div className="panel insights-panel"><div className="panel-header"><div className="panel-title"><span className="panel-icon"><Database size={18}/></span><div><h3>Confusion matrix</h3><p>Correct and incorrect classifications</p></div></div></div><ConfusionMatrix matrix={cm}/></div></div>
          <div className="insights-bottom"><div className="insight-note"><div className="insight-note-icon"><Info size={19}/></div><div><h3>Understanding model limitations</h3><p>{testChurnCases !== null ? `The model found ${cm[1][1]} of ${testChurnCases} churn cases in ${totalTestCases} test customers. It missed ${cm[1][0]} actual churn cases.` : 'Load model metadata to view the error breakdown.'} These predictions use a fixed threshold and uncalibrated probabilities. This IBM sample is for a fictional telecom company.</p></div></div><div className="model-tags"><span>Python</span><span>XGBoost</span><span>FastAPI</span><span>React</span><span>Docker</span></div></div>
        </section>
        <footer className="footer"><span>© ChurnIQ · Educational ML portfolio demo</span><span>Sample data · Not a production decision system · Model v{info?.model_version || '—'}</span></footer>
      </div>
    </main>
  </div>;
}
