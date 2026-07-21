import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Upload, TrendingUp, TrendingDown, Package, DollarSign, ShoppingCart, RotateCcw, ChevronDown } from "lucide-react";

// ---------- sample data generator ----------
const PRODUCTS = [
  { name: "Aurora Desk Lamp", category: "Home" },
  { name: "Voyager Backpack", category: "Accessories" },
  { name: "Nimbus Headphones", category: "Electronics" },
  { name: "Terra Ceramic Mug", category: "Home" },
  { name: "Pulse Fitness Band", category: "Electronics" },
  { name: "Cascade Water Bottle", category: "Accessories" },
  { name: "Solstice Notebook", category: "Stationery" },
  { name: "Drift Wireless Mouse", category: "Electronics" },
  { name: "Ember Candle Set", category: "Home" },
  { name: "Marlow Leather Wallet", category: "Accessories" },
];
const REGIONS = ["North", "South", "East", "West"];

function seedRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateSampleData() {
  const rand = seedRandom(42);
  const rows = [];
  const start = new Date(2025, 6, 1); // Jul 2025
  for (let d = 0; d < 365; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const seasonal = 1 + 0.35 * Math.sin((d / 365) * Math.PI * 2 + 1.2);
    const weekday = date.getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.25 : 1;
    const ordersToday = Math.max(1, Math.round((3 + rand() * 6) * seasonal * weekendBoost));
    for (let o = 0; o < ordersToday; o++) {
      const product = PRODUCTS[Math.floor(rand() * PRODUCTS.length)];
      const region = REGIONS[Math.floor(rand() * REGIONS.length)];
      const basePrice = { Electronics: 85, Home: 32, Accessories: 45, Stationery: 14 }[product.category];
      const unitPrice = +(basePrice * (0.85 + rand() * 0.3)).toFixed(2);
      const qty = 1 + Math.floor(rand() * 4);
      rows.push({
        date: date.toISOString().slice(0, 10),
        product: product.name,
        category: product.category,
        region,
        quantity: qty,
        unitPrice,
        revenue: +(qty * unitPrice).toFixed(2),
      });
    }
  }
  return rows;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CHART_COLORS = ["#1F6F5C", "#E3A008", "#B24C2F", "#3D6E9E", "#7A5AA8"];
const fmtMoney = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtMoney2 = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalesDashboard() {
  const [rawData, setRawData] = useState(() => generateSampleData());
  const [usingSample, setUsingSample] = useState(true);
  const [category, setCategory] = useState("All");
  const [region, setRegion] = useState("All");
  const [monthRange, setMonthRange] = useState("All");
  const [fileName, setFileName] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  const categories = useMemo(() => ["All", ...Array.from(new Set(rawData.map(r => r.category)))], [rawData]);
  const regions = useMemo(() => ["All", ...Array.from(new Set(rawData.map(r => r.region)))], [rawData]);
  const months = useMemo(() => {
    const set = new Set(rawData.map(r => r.date.slice(0, 7)));
    return ["All", ...Array.from(set).sort()];
  }, [rawData]);

  const filtered = useMemo(() => {
    return rawData.filter(r =>
      (category === "All" || r.category === category) &&
      (region === "All" || r.region === region) &&
      (monthRange === "All" || r.date.slice(0, 7) === monthRange)
    );
  }, [rawData, category, region, monthRange]);

  const kpis = useMemo(() => {
    const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const totalOrders = filtered.length;
    const totalUnits = filtered.reduce((s, r) => s + r.quantity, 0);
    const aov = totalOrders ? totalRevenue / totalOrders : 0;

    // compare to previous period (by month) for trend arrow, fallback to first/second half split
    let prevRevenue = null;
    if (monthRange !== "All") {
      const idx = months.indexOf(monthRange);
      const prevMonth = idx > 1 ? months[idx - 1] : null;
      if (prevMonth) {
        prevRevenue = rawData.filter(r =>
          r.date.slice(0, 7) === prevMonth &&
          (category === "All" || r.category === category) &&
          (region === "All" || r.region === region)
        ).reduce((s, r) => s + r.revenue, 0);
      }
    } else {
      const half = Math.floor(filtered.length / 2);
      const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
      const firstHalf = sorted.slice(0, half).reduce((s, r) => s + r.revenue, 0);
      const secondHalf = sorted.slice(half).reduce((s, r) => s + r.revenue, 0);
      prevRevenue = firstHalf;
      var currentHalfForCompare = secondHalf;
    }
    let trendPct = null;
    if (prevRevenue !== null && prevRevenue > 0) {
      const compareTo = monthRange !== "All" ? totalRevenue : currentHalfForCompare;
      trendPct = ((compareTo - prevRevenue) / prevRevenue) * 100;
    }

    const topProduct = Object.entries(
      filtered.reduce((acc, r) => { acc[r.product] = (acc[r.product] || 0) + r.revenue; return acc; }, {})
    ).sort((a, b) => b[1] - a[1])[0];

    return { totalRevenue, totalOrders, totalUnits, aov, trendPct, topProduct };
  }, [filtered, monthRange, months, category, region, rawData]);

  const trendData = useMemo(() => {
    const byMonth = {};
    filtered.forEach(r => {
      const key = r.date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + r.revenue;
    });
    return Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([key, val]) => {
      const [y, m] = key.split("-");
      return { month: `${MONTHS[+m - 1]} ${y.slice(2)}`, revenue: Math.round(val) };
    });
  }, [filtered]);

  const topProductsData = useMemo(() => {
    const byProduct = {};
    filtered.forEach(r => { byProduct[r.product] = (byProduct[r.product] || 0) + r.revenue; });
    return Object.entries(byProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }));
  }, [filtered]);

  const categoryData = useMemo(() => {
    const byCat = {};
    filtered.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.revenue; });
    return Object.entries(byCat).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filtered]);

  const regionData = useMemo(() => {
    const byRegion = {};
    filtered.forEach(r => { byRegion[r.region] = (byRegion[r.region] || 0) + r.revenue; });
    return REGIONS.map(name => ({ name, revenue: Math.round(byRegion[name] || 0) }));
  }, [filtered]);

  const resetFilters = () => { setCategory("All"); setRegion("All"); setMonthRange("All"); };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const cols = results.meta.fields.map(f => f.toLowerCase());
          const required = ["date", "product", "category", "region", "quantity", "unitprice"];
          const hasAll = required.every(r => cols.includes(r) || cols.includes(r.replace("price", " price")));
          const norm = results.data.map(row => {
            const keys = Object.keys(row);
            const find = (name) => {
              const k = keys.find(k => k.toLowerCase().replace(/[\s_]/g, "") === name);
              return k ? row[k] : undefined;
            };
            const date = find("date");
            const product = find("product") || "Unknown";
            const cat = find("category") || "Uncategorized";
            const reg = find("region") || "Unspecified";
            const qty = parseFloat(find("quantity")) || 1;
            const price = parseFloat(find("unitprice")) || 0;
            const rev = find("revenue") ? parseFloat(find("revenue")) : qty * price;
            return {
              date: (date || "").slice(0, 10),
              product, category: cat, region: reg,
              quantity: qty, unitPrice: price, revenue: +rev.toFixed(2),
            };
          }).filter(r => r.date && !isNaN(r.revenue));
          if (norm.length === 0) {
            setImportError("No valid rows found. Expected columns: date, product, category, region, quantity, unitPrice.");
            return;
          }
          setRawData(norm);
          setUsingSample(false);
          setFileName(file.name);
          resetFilters();
        } catch (err) {
          setImportError("Could not parse file. Check the column headers and try again.");
        }
      },
      error: () => setImportError("Could not read file."),
    });
  };

  const loadSample = () => {
    setRawData(generateSampleData());
    setUsingSample(true);
    setFileName(null);
    setImportError(null);
    resetFilters();
  };

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#F9F8F4",
      color: "#12213A",
      minHeight: "100%",
      padding: "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
        select.sd-select {
          appearance: none; -webkit-appearance: none;
          background: #fff; border: 1px solid #DAD5C8; border-radius: 6px;
          padding: 7px 30px 7px 12px; font-family: 'Inter', sans-serif; font-size: 13px;
          color: #12213A; cursor: pointer; font-weight: 500;
        }
        select.sd-select:focus { outline: 2px solid #1F6F5C; outline-offset: 1px; }
        .sd-btn { border: 1px solid #DAD5C8; background: #fff; border-radius: 6px; padding: 7px 14px;
          font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #12213A; }
        .sd-btn:hover { border-color: #1F6F5C; color: #1F6F5C; }
        .sd-btn-primary { background: #12213A; color: #F9F8F4; border-color: #12213A; }
        .sd-btn-primary:hover { background: #1F6F5C; border-color: #1F6F5C; color: #fff; }
        .ledger-num { font-family: 'JetBrains Mono', monospace; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .card { background: #fff; border: 1px solid #E7E2D6; border-radius: 10px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #DAD5C8", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1F6F5C", fontWeight: 700, marginBottom: 4 }}>
            Sales &amp; Revenue Ledger
          </div>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 28, fontWeight: 700, margin: 0, color: "#12213A" }}>
            Performance Dashboard
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6B6656" }}>
            {usingSample ? "Showing sample dataset" : `Loaded: ${fileName}`}
          </span>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
          <button className="sd-btn" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Import CSV
          </button>
          {!usingSample && (
            <button className="sd-btn" onClick={loadSample}><RotateCcw size={14} /> Sample data</button>
          )}
        </div>
      </div>

      {importError && (
        <div style={{ margin: "12px 28px 0", background: "#FBE9E4", border: "1px solid #E3A08A", color: "#8A3420", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
          {importError}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ padding: "16px 28px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #EDE9DD" }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6656", fontWeight: 700, marginRight: 4 }}>Filters</span>
        <FilterSelect value={category} onChange={setCategory} options={categories} label="Category" />
        <FilterSelect value={region} onChange={setRegion} options={regions} label="Region" />
        <FilterSelect value={monthRange} onChange={setMonthRange} options={months} label="Month" formatOpt={(m) => m === "All" ? "All months" : `${MONTHS[+m.split("-")[1]-1]} ${m.split("-")[0]}`} />
        {(category !== "All" || region !== "All" || monthRange !== "All") && (
          <button className="sd-btn" onClick={resetFilters} style={{ marginLeft: 4 }}>
            <RotateCcw size={13} /> Clear
          </button>
        )}
        <span className="num" style={{ marginLeft: "auto", fontSize: 12, color: "#6B6656" }}>
          {filtered.length.toLocaleString()} transactions
        </span>
      </div>

      {/* KPI ledger strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid #DAD5C8" }}>
        <KpiCell
          icon={<DollarSign size={15} />}
          label="Total Revenue"
          value={fmtMoney(kpis.totalRevenue)}
          trend={kpis.trendPct}
        />
        <KpiCell
          icon={<ShoppingCart size={15} />}
          label="Total Orders"
          value={kpis.totalOrders.toLocaleString()}
        />
        <KpiCell
          icon={<Package size={15} />}
          label="Units Sold"
          value={kpis.totalUnits.toLocaleString()}
        />
        <KpiCell
          icon={<TrendingUp size={15} />}
          label="Avg Order Value"
          value={fmtMoney2(kpis.aov)}
        />
      </div>

      {kpis.topProduct && (
        <div style={{ padding: "10px 28px", fontSize: 13, color: "#4A4636", borderBottom: "1px solid #EDE9DD", background: "#F3F0E6" }}>
          Top performer this view: <strong style={{ color: "#12213A" }}>{kpis.topProduct[0]}</strong>
          <span className="num" style={{ marginLeft: 6, color: "#1F6F5C", fontWeight: 700 }}>{fmtMoney(kpis.topProduct[1])}</span>
        </div>
      )}

      {/* Charts grid */}
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
        <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
          <ChartTitle>Revenue Trend</ChartTitle>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE9DD" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B6656" }} axisLine={{ stroke: "#DAD5C8" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6656" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #DAD5C8" }} />
              <Line type="monotone" dataKey="revenue" stroke="#1F6F5C" strokeWidth={2.5} dot={{ r: 3, fill: "#1F6F5C" }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <ChartTitle>Top Products by Revenue</ChartTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topProductsData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE9DD" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#6B6656" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#12213A" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #DAD5C8" }} />
              <Bar dataKey="revenue" fill="#E3A008" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <ChartTitle>Revenue by Category</ChartTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={2}>
                {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #DAD5C8" }} />
              <Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
          <ChartTitle>Revenue by Region</ChartTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={regionData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE9DD" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#12213A" }} axisLine={{ stroke: "#DAD5C8" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6656" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #DAD5C8" }} />
              <Bar dataKey="revenue" fill="#3D6E9E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ padding: "0 28px 24px", fontSize: 12, color: "#8A8570" }}>
        Import your own data via <strong>Import CSV</strong> with columns: date, product, category, region, quantity, unitPrice (revenue optional).
      </div>
    </div>
  );
}

function ChartTitle({ children }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6656", fontWeight: 700, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function KpiCell({ icon, label, value, trend }) {
  return (
    <div style={{ padding: "18px 24px", borderRight: "1px solid #EDE9DD" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B6656", marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="ledger-num" style={{ fontSize: 26, color: "#12213A" }}>{value}</span>
        {trend !== null && trend !== undefined && !isNaN(trend) && (
          <span className="num" style={{
            fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 2,
            color: trend >= 0 ? "#1F6F5C" : "#B24C2F"
          }}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, label, formatOpt }) {
  return (
    <div style={{ position: "relative" }}>
      <select className="sd-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(opt => (
          <option key={opt} value={opt}>{formatOpt ? formatOpt(opt) : opt}</option>
        ))}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#6B6656" }} />
    </div>
  );
}
