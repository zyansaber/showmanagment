import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RestrictedScreenProps = {
  onLogin: () => void;
};

export default function RestrictedScreen({ onLogin }: RestrictedScreenProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <Card className="max-w-lg w-full bg-slate-900 border-slate-800 text-white">
        <CardHeader>
          <CardTitle className="text-2xl">Restricted Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-200">
          <p>Please login first</p>
          <Button onClick={onLogin} className="w-full">
            login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
