/** Shown instead of the portal when a society's trial has ended or its account is paused. */
export default function SocietyClosed() {
    const s = window.APP?.society || {};
    const paused = s.status === 'suspended';
    return (
        <div className="relative grid min-h-full place-items-center overflow-hidden bg-night p-6 text-white">
            <div className="jaali absolute inset-0 opacity-[.05]" aria-hidden="true" />
            <div className="relative max-w-md text-center">
                <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-white/[.07] ring-1 ring-white/10"><img src="/icon.svg" alt="" className="size-9" /></div>
                <h1 className="text-[28px] font-bold leading-tight tracking-tight">{s.display_name || s.name}</h1>
                <p className="mt-3 text-white/65">{paused ? "This society's portal is paused. Please contact your society office." : 'The free trial of this portal has ended. The society office needs to choose a plan to switch it back on — all data is kept safe.'}</p>
                <a href="https://www.ferasolution.com" className="btn mt-7 bg-sand-400 text-night hover:bg-sand-100">Contact Fera Solution</a>
                <div className="mt-4"><a href="/" className="text-sm text-white/50 hover:text-white">Fera Community Cloud</a></div>
            </div>
        </div>
    );
}
