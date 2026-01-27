import { useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Printer, QrCode, FileImage, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface QRCodeGeneratorProps {
  storeSlug: string;
  storeName: string;
  baseUrl?: string;
}

type TemplateType = 'simple' | 'poster' | 'compact';
type QRSize = 'small' | 'medium' | 'large';
type PaperSize = 'a4' | 'a5' | 'card';

const QR_SIZES: Record<QRSize, number> = {
  small: 128,
  medium: 200,
  large: 300,
};

const PAPER_SIZES: Record<PaperSize, { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: 'A4' },
  a5: { width: 148, height: 210, label: 'A5' },
  card: { width: 91, height: 55, label: '名刺サイズ' },
};

export function QRCodeGenerator({ storeSlug, storeName, baseUrl }: QRCodeGeneratorProps) {
  const { t } = useLocale();
  const qrRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  
  const [template, setTemplate] = useState<TemplateType>('poster');
  const [qrSize, setQrSize] = useState<QRSize>('medium');
  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [customTitle, setCustomTitle] = useState('');
  const [customSubtitle, setCustomSubtitle] = useState('');
  
  // Generate URL
  const effectiveBaseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const storeUrl = `${effectiveBaseUrl}/s/${storeSlug}`;
  const joinUrl = `${effectiveBaseUrl}/s/${storeSlug}/join`;
  
  // Download as PNG
  const downloadPNG = useCallback(async () => {
    const targetRef = template === 'simple' ? qrRef : posterRef;
    if (!targetRef.current) return;
    
    try {
      const canvas = await html2canvas(targetRef.current, {
        scale: 3,
        backgroundColor: bgColor,
        useCORS: true,
      });
      
      const link = document.createElement('a');
      link.download = `${storeSlug}-qrcode.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success(t('qrcode.downloadSuccess'));
    } catch (error) {
      console.error('Failed to download PNG:', error);
      toast.error(t('qrcode.downloadError'));
    }
  }, [template, storeSlug, bgColor, t]);
  
  // Download as SVG
  const downloadSVG = useCallback(() => {
    const svgElement = qrRef.current?.querySelector('svg');
    if (!svgElement) return;
    
    try {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const link = document.createElement('a');
      link.download = `${storeSlug}-qrcode.svg`;
      link.href = svgUrl;
      link.click();
      
      URL.revokeObjectURL(svgUrl);
      toast.success(t('qrcode.downloadSuccess'));
    } catch (error) {
      console.error('Failed to download SVG:', error);
      toast.error(t('qrcode.downloadError'));
    }
  }, [storeSlug, t]);
  
  // Download as PDF
  const downloadPDF = useCallback(async () => {
    const targetRef = template === 'simple' ? qrRef : posterRef;
    if (!targetRef.current) return;
    
    try {
      const canvas = await html2canvas(targetRef.current, {
        scale: 3,
        backgroundColor: bgColor,
        useCORS: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const paper = PAPER_SIZES[paperSize];
      const pdf = new jsPDF({
        orientation: paper.width > paper.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [paper.width, paper.height],
      });
      
      // Calculate image dimensions to fit the page with margins
      const margin = 10;
      const maxWidth = paper.width - margin * 2;
      const maxHeight = paper.height - margin * 2;
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;
      const x = (paper.width - finalWidth) / 2;
      const y = (paper.height - finalHeight) / 2;
      
      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      pdf.save(`${storeSlug}-qrcode.pdf`);
      
      toast.success(t('qrcode.downloadSuccess'));
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast.error(t('qrcode.downloadError'));
    }
  }, [template, storeSlug, bgColor, paperSize, t]);
  
  // Print
  const handlePrint = useCallback(() => {
    window.print();
  }, []);
  
  const displayTitle = customTitle || storeName;
  const displaySubtitle = customSubtitle || t('qrcode.defaultSubtitle');
  
  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {t('qrcode.title')}
          </CardTitle>
          <CardDescription>{t('qrcode.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>{t('qrcode.template')}</Label>
            <Tabs value={template} onValueChange={(v) => setTemplate(v as TemplateType)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="simple">{t('qrcode.templateSimple')}</TabsTrigger>
                <TabsTrigger value="poster">{t('qrcode.templatePoster')}</TabsTrigger>
                <TabsTrigger value="compact">{t('qrcode.templateCompact')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* QR Size */}
            <div className="space-y-2">
              <Label>{t('qrcode.size')}</Label>
              <Select value={qrSize} onValueChange={(v) => setQrSize(v as QRSize)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{t('qrcode.sizeSmall')} (128px)</SelectItem>
                  <SelectItem value="medium">{t('qrcode.sizeMedium')} (200px)</SelectItem>
                  <SelectItem value="large">{t('qrcode.sizeLarge')} (300px)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Paper Size (for PDF) */}
            <div className="space-y-2">
              <Label>{t('qrcode.paperSize')}</Label>
              <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="a5">A5</SelectItem>
                  <SelectItem value="card">{t('qrcode.cardSize')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Colors */}
            <div className="space-y-2">
              <Label>{t('qrcode.fgColor')}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="flex-1"
                  maxLength={7}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t('qrcode.bgColor')}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          
          {/* Custom Text (for poster template) */}
          {template !== 'simple' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('qrcode.customTitle')}</Label>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={storeName}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('qrcode.customSubtitle')}</Label>
                <Input
                  value={customSubtitle}
                  onChange={(e) => setCustomSubtitle(e.target.value)}
                  placeholder={t('qrcode.defaultSubtitle')}
                />
              </div>
            </div>
          )}
          
          {/* URL Display */}
          <div className="p-3 bg-muted rounded-lg">
            <Label className="text-xs text-muted-foreground">{t('qrcode.url')}</Label>
            <p className="font-mono text-sm break-all mt-1">{storeUrl}</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>{t('qrcode.preview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-4 bg-gray-100 rounded-lg">
            {/* Simple QR Code */}
            {template === 'simple' && (
              <div
                ref={qrRef}
                className="p-4"
                style={{ backgroundColor: bgColor }}
              >
                <QRCodeSVG
                  value={storeUrl}
                  size={QR_SIZES[qrSize]}
                  fgColor={fgColor}
                  bgColor={bgColor}
                  level="H"
                  includeMargin
                />
              </div>
            )}
            
            {/* Poster Template */}
            {template === 'poster' && (
              <div
                ref={posterRef}
                className="p-8 text-center max-w-md"
                style={{ backgroundColor: bgColor }}
              >
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ color: fgColor }}
                >
                  {displayTitle}
                </h2>
                <p
                  className="text-lg mb-6"
                  style={{ color: fgColor, opacity: 0.8 }}
                >
                  {displaySubtitle}
                </p>
                <div ref={qrRef} className="flex justify-center mb-6">
                  <QRCodeSVG
                    value={storeUrl}
                    size={QR_SIZES[qrSize]}
                    fgColor={fgColor}
                    bgColor={bgColor}
                    level="H"
                    includeMargin
                  />
                </div>
                <p
                  className="text-sm"
                  style={{ color: fgColor, opacity: 0.6 }}
                >
                  {t('qrcode.scanInstruction')}
                </p>
              </div>
            )}
            
            {/* Compact Template */}
            {template === 'compact' && (
              <div
                ref={posterRef}
                className="p-4 text-center"
                style={{ backgroundColor: bgColor }}
              >
                <div ref={qrRef} className="flex justify-center mb-2">
                  <QRCodeSVG
                    value={storeUrl}
                    size={QR_SIZES[qrSize]}
                    fgColor={fgColor}
                    bgColor={bgColor}
                    level="H"
                    includeMargin
                  />
                </div>
                <p
                  className="text-sm font-medium"
                  style={{ color: fgColor }}
                >
                  {displayTitle}
                </p>
              </div>
            )}
          </div>
          
          {/* Download Buttons */}
          <div className="flex flex-wrap gap-3 mt-6 justify-center">
            <Button onClick={downloadPNG} variant="outline">
              <FileImage className="h-4 w-4 mr-2" />
              PNG
            </Button>
            <Button onClick={downloadSVG} variant="outline">
              <FileImage className="h-4 w-4 mr-2" />
              SVG
            </Button>
            <Button onClick={downloadPDF} variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              PDF ({PAPER_SIZES[paperSize].label})
            </Button>
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              {t('qrcode.print')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
