
CREATE POLICY "Public read farmer profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (role = 'farmer');
CREATE POLICY "Public read active listings anon" ON public.listings FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "Public read parcels" ON public.parcels FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.listings TO anon;
GRANT SELECT ON public.parcels TO anon;
GRANT SELECT ON public.certifications TO anon;
