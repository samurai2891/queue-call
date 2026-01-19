import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Phone, CheckCircle, Loader2, XCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { RATE_LIMITED_ERR_MSG } from '@shared/const';


interface SmsRegistrationProps {
  ticketId: number;
}

// Country codes for phone number input
const COUNTRY_CODES = [
  { code: '+81', country: '日本', flag: '🇯🇵' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+82', country: '한국', flag: '🇰🇷' },
  { code: '+86', country: '中国', flag: '🇨🇳' },
  { code: '+886', country: '台灣', flag: '🇹🇼' },
  { code: '+852', country: '香港', flag: '🇭🇰' },
  { code: '+65', country: 'Singapore', flag: '🇸🇬' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
];

type Step = 'idle' | 'input' | 'verify' | 'verified' | 'error';

export function SmsRegistration({ ticketId }: SmsRegistrationProps) {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('idle');
  const [countryCode, setCountryCode] = useState('+81');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Get current SMS status
  const { data: smsStatus, refetch: refetchStatus } = trpc.notification.getSmsStatus.useQuery(
    { ticketId },
    { enabled: !!ticketId }
  );

  const getErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';

      switch (message) {
        case RATE_LIMITED_ERR_MSG:
          return t('common.rateLimited');
        case 'SMS notifications are not enabled for this store':
          return t('sms.errorNotEnabled');

      case 'SMS service is not configured':
        return t('sms.errorNotConfigured');
      case 'Phone number already verified':
        return t('sms.errorAlreadyVerified');
      case 'Failed to send verification code':
        return t('sms.errorSendFailed');
      case 'Invalid phone number format':
        return t('sms.errorInvalidPhone');
      case 'Verification code must be 6 digits':
        return t('sms.errorInvalidCodeFormat');
      case 'No pending verification found':
        return t('sms.errorNoPendingVerification');
      case 'Invalid verification code':
        return t('sms.errorInvalidCode');
      case 'No subscription found':
        return t('sms.errorNoSubscription');
      default:
        return t('sms.error');
    }
  };

  // Register SMS mutation
  const registerMutation = trpc.notification.registerSms.useMutation({
    onSuccess: () => {
      setStep('verify');
      toast.success(t('sms.codeSent'));
    },
    onError: (error) => {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      setStep('error');
      toast.error(message);
    },
  });

  // Verify SMS mutation
  const verifyMutation = trpc.notification.verifySms.useMutation({
    onSuccess: () => {
      setStep('verified');
      refetchStatus();
      toast.success(t('sms.verified'));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Unsubscribe mutation
  const unsubscribeMutation = trpc.notification.unsubscribeSms.useMutation({
    onSuccess: () => {
      setStep('idle');
      refetchStatus();
      toast.success(t('sms.unsubscribed'));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Update step based on status
  useEffect(() => {
    if (smsStatus?.verified && !smsStatus.optedOut) {
      setStep('verified');
    } else if (smsStatus?.registered && !smsStatus.verified) {
      setStep('verify');
    }
  }, [smsStatus]);

  const formatPhoneNumber = (phone: string): string => {
    // Remove leading 0 for Japanese numbers
    let formatted = phone.replace(/[^\d]/g, '');
    if (countryCode === '+81' && formatted.startsWith('0')) {
      formatted = formatted.substring(1);
    }
    return `${countryCode}${formatted}`;
  };

  const handleSendCode = () => {
    const phoneE164 = formatPhoneNumber(phoneNumber);
    registerMutation.mutate({ ticketId, phoneE164 });
  };

  const handleVerify = () => {
    verifyMutation.mutate({ ticketId, code: verificationCode });
  };

  const handleUnsubscribe = () => {
    unsubscribeMutation.mutate({ ticketId });
  };

  const handleStartRegistration = () => {
    setStep('input');
    setErrorMessage('');
  };

  // Verified state
  if (step === 'verified' || (smsStatus?.verified && !smsStatus.optedOut)) {
    return (
      <Card className="border-success/50 bg-success/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-success/20">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-success">{t('sms.registered')}</p>
                <p className="text-sm text-muted-foreground">
                  {smsStatus?.phoneE164?.replace(/(\+\d{1,3})(\d{2,3})(\d+)(\d{4})/, '$1 $2-****-$4')}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnsubscribe}
              disabled={unsubscribeMutation.isPending}
            >
              {unsubscribeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="ml-1">{t('sms.unsubscribe')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Verification code input
  if (step === 'verify') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('sms.verifyTitle')}
          </CardTitle>
          <CardDescription>{t('sms.verifyDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">{t('sms.verificationCode')}</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep('input')}
              className="flex-1"
            >
              {t('common.back')}
            </Button>
            <Button
              onClick={handleVerify}
              disabled={verificationCode.length !== 6 || verifyMutation.isPending}
              className="flex-1"
            >
              {verifyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {t('sms.verify')}
            </Button>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={handleSendCode}
            disabled={registerMutation.isPending}
            className="w-full"
          >
            {registerMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {t('sms.resendCode')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Phone number input
  if (step === 'input') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t('sms.registerTitle')}
          </CardTitle>
          <CardDescription>{t('sms.registerDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone-number">{t('sms.phoneNumber')}</Label>
            <div className="flex gap-2">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="w-[120px]" aria-label={t('sms.phoneNumber')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="phone-number"
                type="tel"
                inputMode="numeric"
                placeholder={countryCode === '+81' ? '090-1234-5678' : '123-456-7890'}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('sms.phoneHint')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep('idle')}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSendCode}
              disabled={!phoneNumber || registerMutation.isPending}
              className="flex-1"
            >
              {registerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {t('sms.sendCode')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/20">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-destructive">{t('sms.error')}</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleStartRegistration}>
              {t('common.retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Idle state - show registration button
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-muted">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{t('sms.title')}</p>
              <p className="text-sm text-muted-foreground">{t('sms.description')}</p>
            </div>
          </div>
          <Button onClick={handleStartRegistration}>
            {t('sms.register')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
