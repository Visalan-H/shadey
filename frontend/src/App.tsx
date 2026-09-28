import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { MyPaintingsPage } from './pages/MyPaintingsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { SharePage } from './pages/SharePage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <div className="flex min-h-screen flex-col">
                    <Header />
                    <main className="flex-1">
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/p/:id" element={<SharePage />} />
                            <Route path="/me" element={<MyPaintingsPage />} />
                            <Route path="/privacy" element={<PrivacyPage />} />
                            <Route path="/admin" element={<AdminPage />} />
                        </Routes>
                    </main>
                    <Footer />
                </div>
            </BrowserRouter>
        </QueryClientProvider>
    );
}
