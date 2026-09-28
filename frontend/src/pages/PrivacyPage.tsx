import type { ReactNode } from 'react';
import { Link } from 'react-router';

const CONTACT = 'visalanprivate@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {children}
        </section>
    );
}

export function PrivacyPage() {
    return (
        <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 leading-relaxed">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold">Privacy</h1>
                <p className="text-sm text-muted">Last updated 28 September 2026</p>
            </div>

            <p>
                Shadey keeps only what it needs to paint your graph and show your paintings. It has no ads and no analytics, and it
                never sells or shares your data.
            </p>

            <Section title="What we store">
                <ul className="flex list-disc flex-col gap-1 pl-5">
                    <li>
                        <strong>Your GitHub profile</strong> when you sign in: your user ID, username, display name, avatar link and the
                        permissions you granted.
                    </li>
                    <li>
                        <strong>Your GitHub access token</strong>, encrypted with AES-256-GCM. We use it only to create the painting repo and
                        push its commits when you press Paint.
                    </li>
                    <li>
                        <strong>Each painting</strong>: the repo's name and link, the text, the design, and the dates and commit counts
                        painted. This powers My paintings and the share page.
                    </li>
                    <li>
                        <strong>Graphs you look up</strong>, cached for up to an hour so we call GitHub less. These are public on GitHub
                        already.
                    </li>
                    <li>
                        <strong>How many paintings you made in the last 24 hours</strong>, to enforce the limit of five a day. This
                        clears itself after a day.
                    </li>
                    <li>
                        <strong>Reports.</strong> If you report a painting, we keep the reason you typed plus your account ID, or a
                        one-way hash of your IP address if you're signed out. We never store the IP address itself.
                    </li>
                </ul>
            </Section>

            <Section title="Cookies and browser storage">
                <p>
                    One cookie keeps you signed in. Two more last ten minutes each, while you sign in with GitHub or delete a repo. Your browser also
                    remembers your username, to fill in the form faster, and your unfinished design until you close the tab. There are no
                    tracking cookies.
                </p>
            </Section>

            <Section title="Who can see what">
                <p>
                    Share pages are public. They show your username, the painting and its text. The painting repo lives on your GitHub
                    account and is public unless you ticked "Private repo".
                </p>
                <p>
                    The app runs on Vercel and stores data in a MongoDB database. GitHub handles sign-in, and we talk to GitHub's API on
                    your behalf. Nobody else gets your data.
                </p>
            </Section>

            <Section title="Reports and takedowns">
                <p>
                    Anyone can report a share page. We may take down a share page and its preview image if it's offensive. Your repo on
                    GitHub is yours and stays untouched.
                </p>
            </Section>

            <Section title="Deleting your data">
                <p>
                    Press "Delete account" on{' '}
                    <Link to="/me" className="link">
                        My paintings
                    </Link>
                    . That deletes everything listed above, takes your share pages down and removes Shadey from your GitHub account. Your
                    painted repos stay on GitHub, so delete those first if you want your graph back the way it was.
                </p>
                <p>
                    You can also cut off Shadey's access at any time from{' '}
                    <a href="https://github.com/settings/applications" target="_blank" rel="noreferrer" className="link">
                        GitHub's authorized apps settings
                    </a>
                    .
                </p>
            </Section>

            <Section title="Contact">
                <p>
                    Questions, data requests or takedown requests go to{' '}
                    <a href={`mailto:${CONTACT}`} className="link">
                        {CONTACT}
                    </a>
                    .
                </p>
            </Section>
        </article>
    );
}
