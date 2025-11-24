'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Download, Printer, Lock, Phone, Home, Globe } from 'lucide-react';

interface Item {
  description: string;
  quantity: number;
  rate: number;
}

const InvoiceGenerator: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [accessCode, setAccessCode] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('ecsexpresscareservice@okicici');
  const [items, setItems] = useState<Item[]>([
    { description: '', quantity: 1, rate: 0 }
  ]);
  const [discount, setDiscount] = useState<number>(0);
  const [advance, setAdvance] = useState<number>(0);

  const [showPreview, setShowPreview] = useState<boolean>(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const authStatus = sessionStorage.getItem('invoiceAuth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleAuthentication = (e: React.FormEvent) => {
    e.preventDefault();
    const validCode = process.env.NEXT_PUBLIC_ACCESS_CODE || 'APPOSITE2025';
    
    if (accessCode === validCode) {
      setIsAuthenticated(true);
      sessionStorage.setItem('invoiceAuth', 'true');
      setAuthError('');
    } else {
      setAuthError('Invalid access code. Please try again.');
      setAccessCode('');
    }
  };

  const addItem = (): void => {
    setItems([...items, { description: '', quantity: 1, rate: 0 }]);
  };

  const removeItem = (index: number): void => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof Item, value: string | number): void => {
    const newItems = [...items];
    newItems[index][field] = value as never;
    setItems(newItems);
  };

  const subtotal: number = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const grandTotal: number = subtotal - discount;
  const balanceDue: number = grandTotal - advance;


  const generateQRCode = (): string => {
    const upiString = `upi://pay?pa=${upiId}&am=${grandTotal}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiString)}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month}, ${year}`;
  };

  const handlePrint = (): void => {
    window.print();
  };

  const handleDownloadPDF = async (): Promise<void> => {
  const container = document.getElementById('invoice-content-only');
  if (!container) {
    alert('Invoice preview not found. Please click Preview first.');
    return;
  }
  const keepWhole = document.getElementById('payment-and-footer');

  const origPB = (container as HTMLElement).style.paddingBottom;

  try {
    // Normalize to exact A4 height (so we can always width-fit)
    const PX_PER_MM = 3.779528;
    const TARGET_PX = 297 * PX_PER_MM;
    const rect = container.getBoundingClientRect();
    const currentPx = rect.height;
    const delta = TARGET_PX - currentPx;
    if (Math.abs(delta) > 0.5) {
      const currentPB = parseFloat(getComputedStyle(container).paddingBottom || '0');
      (container as HTMLElement).style.paddingBottom = `${Math.max(0, currentPB + delta)}px`;
    }

    document.documentElement.setAttribute('data-export', 'true');
    const html2canvas = (await import('html2canvas-pro')).default;
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1800,
    });

    document.documentElement.removeAttribute('data-export');
    (container as HTMLElement).style.paddingBottom = origPB;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const MM_PER_PX = 0.264583;

    // Always fit by WIDTH
    const ratio = pdfW / (canvas.width * MM_PER_PX);
    const pageHeightPx = Math.floor(pdfH / (MM_PER_PX * ratio)); // height in source pixels per PDF page

    // Calculate the block we must keep whole (relative to container)
    let blockStart = -1, blockEnd = -1;
    if (keepWhole) {
      const top0 = container.getBoundingClientRect().top;
      const r = keepWhole.getBoundingClientRect();
      blockStart = Math.max(0, Math.floor(r.top - top0));
      blockEnd   = Math.min(canvas.height, Math.ceil(r.bottom - top0));
    }

    // Helper to draw a vertical slice of canvas into the PDF
    const addSlice = (yStart: number, sliceHeight: number, addPage: boolean) => {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = sliceHeight;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(canvas, 0, yStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const imgData = off.toDataURL('image/png', 1.0);
      const drawW = pdfW;
      const drawH = sliceHeight * MM_PER_PX * ratio;
      if (addPage) pdf.addPage();
      // Add small top margin (only for pages after the first)
      const yPos = addPage ? 15 : 0; // 15 mm top margin
      pdf.addImage(imgData, 'PNG', 0, yPos, drawW, drawH - yPos);

    };

    // Build pages without cutting through the protected block
    let y = 0;
    const marginPx = 24; // small safety margin before the block

    while (y < canvas.height) {
      let nextCut = y + pageHeightPx;

      // If we have a protected block and the next cut would slice through it:
      const willCutBlock =
        blockStart >= 0 &&
        y < blockStart &&      // current page starts before the block
        nextCut > blockStart && nextCut < blockEnd; // cut line falls inside block

      if (willCutBlock) {
        // 1) Finish current page just before the block (leave a margin)
        const slice1 = Math.max(0, Math.min(blockStart - marginPx, canvas.height) - y);
        if (slice1 > 0) {
          addSlice(y, slice1, y !== 0);
          y += slice1;
        }

        // 2) Put the entire block starting on a NEW page
        const blockHeight = blockEnd - y; // because y now should be at (≈) blockStart
        if (blockHeight > 0) {
          let remainingBlock = blockHeight;
          while (remainingBlock > 0) {
            const h = Math.min(pageHeightPx, remainingBlock);
            addSlice(y, h, true);
            y += h;
            remainingBlock -= h;
          }
        }
        // loop continues with whatever remains after the block
        continue;
      }

      // Normal slicing (no block conflict)
      const sliceH = Math.min(pageHeightPx, canvas.height - y);
      addSlice(y, sliceH, y !== 0);
      y += sliceH;
    }

    pdf.save(`Invoice_${invoiceNo || 'draft'}_${Date.now()}.pdf`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    document.documentElement.removeAttribute('data-export');
    (container as HTMLElement).style.paddingBottom = origPB;
    alert('Failed to generate PDF. Please try the Print option and save as PDF.');
  }
};


  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
          * { font-family: 'Inter', sans-serif; }
        `}</style>
        
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
              <Lock size={48} className="text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Secure Access</h1>
            <p className="text-gray-600">Enter your access code to continue</p>
          </div>

          <form onSubmit={handleAuthentication}>
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2 text-gray-900">
                Access Code
              </label>
              <input
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter access code"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium text-center text-lg tracking-widest"
                autoFocus
              />
              {authError && (
                <p className="mt-2 text-sm text-red-600 font-medium">{authError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold text-lg shadow-lg"
            >
              Access Invoice Generator
            </button>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 text-center">
                <strong>Note:</strong> Contact administrator for access code
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        
        * { font-family: 'Inter', sans-serif; }

        /* === A4 canvas + readable base === */
        #invoice-content-only{
          width: 210mm;
          min-height: 297mm;
          padding: 0 11mm 9mm;   /* top=0, left/right=11mm, bottom=9mm */
          box-sizing: border-box;
          font-size: 15.5px;          /* bigger base for entire page */
          line-height: 1.5;
        }

        #invoice-content-only .full-bleed{
          /* container has left/right padding = 11mm */
          margin-left: calc(-11mm - 0.5mm);
          margin-right: calc(-11mm - 0.5mm);
          padding-left: 11mm;
          padding-right: 11mm;
        }

        /* Ensure no transforms during export */
        html[data-export] #invoice-content-only { transform: none !important; }

        @media print {
          @page { size: A4; margin: 0; }
          body * { visibility: hidden; }
          #invoice-content-only, #invoice-content-only * { visibility: visible; }
          #invoice-content-only {
            position: absolute;
            left: 0; top: 0;
            width: 210mm;
            min-height: 297mm;
            padding: 9mm 11mm;
          }
          .no-print { display: none !important; }
        }

        a { color: inherit; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      {/* Form Section */}
      <div className={`max-w-6xl mx-auto p-8 ${showPreview ? 'no-print' : ''}`}>
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Invoice Generator</h1>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Work Date</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-900">Invoice No.</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="0127"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium placeholder-gray-400"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-900">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Mr. Reshma Ragesh"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium placeholder-gray-400"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-900">Customer Address</label>
            <textarea
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="RR Fitness CrossFit & Diet Centre&#10;Fitness - Personal trainer"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium placeholder-gray-400"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-900">Customer Phone</label>
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 9748234455"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium placeholder-gray-400"
            />
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Items</h2>
              <button
                onClick={addItem}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
              >
                <Plus size={18} />
                Add Item
              </button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 mb-4 items-end">
                <div className="col-span-5">
                  <label className="block text-sm font-semibold mb-2 text-gray-900">Description</label>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    placeholder="Feature Presentation Invite video"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium placeholder-gray-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2 text-gray-900">Quantity</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2 text-gray-900">Rate (₹)</label>
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2 text-gray-900">Total</label>
                  <div className="px-4 py-2 bg-gray-100 rounded-lg font-bold text-gray-900">
                    ₹{(item.quantity * item.rate).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="col-span-1">
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(index)}
                      className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Discount (₹)</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Advance Paid (₹)</label>
              <input
                type="number"
                value={advance}
                onChange={(e) => setAdvance(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">UPI ID</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
              />
            </div>
          </div>


          <div className="bg-gray-100 rounded-lg p-6">
            <div className="flex justify-between mb-2 text-lg">
              <span className="font-semibold text-gray-900">Subtotal:</span>
              <span className="font-bold text-gray-900">₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between mb-2 text-lg">
              <span className="font-semibold text-gray-900">Discount:</span>
              <span className="font-bold text-gray-900">₹{discount.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-2xl border-t-2 border-gray-300 pt-4">
              <span className="font-bold text-gray-900">Grand Total:</span>
              <span className="font-bold text-blue-600">₹{grandTotal.toLocaleString('en-IN')}/-</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {showPreview && (
        <div className="max-w-4xl mx-auto p-8 no-print">
          <div id="invoice-content-only" className="bg-white shadow-2xl overflow-hidden">
            <div className="relative">
              {/* Overlay Watermark */}
              <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <img
                    src="/overlay.png"
                    alt="Overlay"
                    className="w-[420px] h-[420px] object-contain opacity-[0.07]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>


              {/* Header - Full bleed */}
              <div className="bg-black text-white px-12 py-9 relative full-bleed" style={{ zIndex: 2 }}>
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-7xl font-bold tracking-tight" style={{ fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                      Invoice
                    </h1>
                  </div>
                  <div className="text-right">
                    <img 
                      src="/logo.png"
                      alt="Apposite Productions" 
                      className="h-32 w-auto object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.parentElement) {
                          target.parentElement.innerHTML = `
                            <div class="text-white text-right">
                              <div class="text-lg font-bold">Apposite</div>
                              <div class="text-[10px] tracking-wider">PRODUCTIONS</div>
                            </div>
                          `;
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-12 py-8 relative" style={{ zIndex: 2 }}>
                {/* Top Info Section */}
                <div className="flex justify-between mb-6">
                  <div className="space-y-0">
                    <p className="text-[14px] leading-tight text-black"><span className="font-semibold">Date :</span> <span className="font-normal">{formatDate(invoiceDate)}</span></p>
                    <p className="text-[14px] leading-tight text-black"><span className="font-semibold">Invoice No.</span> <span className="font-normal">{invoiceNo}</span></p>
                    <p className="text-[14px] leading-tight text-black"><span className="font-semibold">Work Date :</span> <span className="font-normal">{formatDate(workDate)}</span></p>
                  </div>
                  <div className="text-right space-y-0">
                    <p className="text-[14px] leading-tight text-black font-normal flex items-center justify-end gap-1">
                      <a href="tel:+918590664507" className="hover:text-blue-600">+91 85906 64507</a>
                      <Phone size={14} className="text-black" />
                    </p>
                    <p className="text-[14px] leading-tight text-black font-normal flex items-center justify-end gap-1">
                      ECS BUILDING - THAZHATHANGADI
                      <Home size={14} className="text-black" />
                    </p>
                    <p className="text-[14px] leading-tight text-black font-normal">ROAD AREEKODE MALAPPURAM 673639</p>
                    <p className="text-[14px] leading-tight text-black font-normal flex items-center justify-end gap-1">
                      <a href="https://theapposite.in" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">theapposite.in</a>
                      <Globe size={14} className="text-black" />
                    </p>
                  </div>
                </div>

                {/* Billed To */}
                <div className="mb-6">
                  <h3 className="text-[16px] font-bold text-black mb-1 leading-tight">Billed to:</h3>
                  <p className="text-[14px] font-bold text-black leading-tight">{customerName}</p>
                  {customerAddress.split('\n').map((line, i) => (
                    <p key={i} className="text-[14px] font-normal text-black leading-tight">{line}</p>
                  ))}
                  {customerPhone && (
                    <p className="text-[14px] font-normal text-black leading-tight">{customerPhone}</p>
                  )}
                </div>

                {/* Items Table */}
                <table className="w-full mb-5">
                  <thead>
                    <tr className="border-b-2 border-black">
                      <th className="text-left py-3 text-[13px] font-bold text-black uppercase tracking-wide">Description</th>
                      <th className="text-center py-3 text-[13px] font-bold text-black uppercase tracking-wide w-20">Quantity</th>
                      <th className="text-right py-3 text-[13px] font-bold text-black uppercase tracking-wide w-24">Rate</th>
                      <th className="text-right py-3 text-[13px] font-bold text-black uppercase tracking-wide w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index} className="border-b border-gray-300">
                        <td className="py-3.5 text-[14px] font-normal text-black">{item.description}</td>
                        <td className="py-3.5 text-[14px] font-normal text-center text-black">{item.quantity}</td>
                        <td className="py-3.5 text-[14px] font-normal text-right text-black">₹{item.rate.toLocaleString('en-IN')}</td>
                        <td className="py-3.5 text-[14px] font-normal text-right text-black">₹{(item.quantity * item.rate).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <div className="w-72 space-y-1">
                    <div className="flex justify-between text-[14px]">
                      <span className="font-normal text-black">Subtotal:</span>
                      <span className="font-normal text-black">₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-[14px]">
                      <span className="font-normal text-black">Discount:</span>
                      <span className="font-normal text-black">₹{discount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-[20px] font-extrabold border-t-2 border-black pt-2">
                      <span className="text-black">Grand Total:</span>
                      <span className="text-black">₹{grandTotal.toLocaleString('en-IN')}/-</span>
                    </div>

                    {advance > 0 && (
                      <>
                        <div className="flex justify-between text-[14px]">
                          <span className="font-normal text-black">Advance Paid:</span>
                          <span className="font-normal text-black">₹{advance.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-[18px] font-extrabold border-t border-gray-400 pt-1">
                          <span className="text-black">Balance Due:</span>
                          <span className="text-black">₹{balanceDue.toLocaleString('en-IN')}/-</span>
                        </div>
                      </>
                    )}

                  </div>
                </div>

                {/* Payment + Footer wrapper */}
                <div id="payment-and-footer">

                {/* Payment Info */}
                <div className="border-t-2 border-gray-300 pt-6">
                  <h3 className="text-[16px] font-bold text-black mb-3 uppercase tracking-wide">Payment Info</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border-2 border-black rounded-md p-3">
                      <ul className="space-y-1.5 text-[13px]">
                        <li className="flex items-start leading-tight">
                          <span className="mr-1.5 text-black font-bold">•</span>
                          <span className="text-black font-bold">KERALA GRAMIN BANK</span>
                        </li>
                        <li className="flex items-start leading-tight">
                          <span className="mr-1.5 text-black font-bold">•</span>
                          <span className="text-black font-bold">ACCOUNT NUMBER - 40228101071032</span>
                        </li>
                        <li className="flex items-start leading-tight">
                          <span className="mr-1.5 text-black font-bold">•</span>
                          <span className="text-black font-bold">IFSC CODE - KLGB0040228</span>
                        </li>
                        <li className="flex items-start leading-tight">
                          <span className="mr-1.5 text-black font-bold">•</span>
                          <span className="text-black font-bold">PHONE NUMBER - 9074878484</span>
                        </li>
                        <li className="flex items-start leading-tight">
                          <span className="mr-1.5 text-black font-bold">•</span>
                          <span className="text-black font-bold">UPI ID - {upiId}</span>
                        </li>
                      </ul>
                    </div>
                    <div className="border-2 border-black rounded-md p-3 flex flex-col items-center justify-center">
                      <img 
                        src={generateQRCode()} 
                        alt="Payment QR Code" 
                        className="w-44 h-44 mb-2"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      <p className="text-[12px] font-bold text-center text-black leading-tight uppercase">
                        Scan Here To<br/>Make Payments
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-right">
                  <h2 className="text-[28px] font-bold text-black leading-tight uppercase tracking-tight">Thank You For</h2>
                  <h2 className="text-[28px] font-bold text-black leading-tight uppercase tracking-tight">Your Business</h2>
                </div>
              </div>

              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 bg-green-600 text-white px-8 py-4 rounded-lg hover:bg-green-700 transition text-lg font-semibold shadow-lg"
            >
              <Download size={24} />
              Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition text-lg font-semibold shadow-lg"
            >
              <Printer size={24} />
              Print Invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;
