# Shadey

![A GitHub contribution graph with the word SHADEY painted on it](.github/images/hero.png)

Your contribution graph is the first thing people see on your GitHub profile. Shadey lets you write on it.

Type a word or draw something, see it on your real graph, and paint it with one click.

**[Try it at shadey.vercel.app](https://shadey.vercel.app)**

## What it looks like

![HIRE ME painted across a year of real contributions](.github/images/hire-me.png)

That's a real graph with HIRE ME painted over it. Your own days stay visible, and the amber outlines mark days where you already had commits, so nothing lands on top of your work by surprise.

## How it works

1. Enter your GitHub username. Shadey shows your graph as it looks today.
2. Type a word or switch to Draw and fill in squares yourself. The painting appears on your graph as you go.
3. Pick where it goes and how dark it should be. "Find best spot" moves it to the quietest part of your year.
4. Sign in with GitHub and press Paint. Shadey creates one new repo with empty commits dated on the days you painted, and those squares turn green.

## Draw anything

![A heart drawn in the pixel editor and previewed on the graph](.github/images/draw.png)

Letters are the quick option. The Draw tab gives you a grid the same height as your graph, so hearts, logos and tiny space invaders all work. On a phone, one finger draws and two fingers scroll.

## Questions people ask

**Does it touch my other repos?**
No. Shadey makes one new repo per painting and only puts empty commits in it. It never reads or changes your code.

**How do I undo it?**
Delete the repo. GitHub removes those days from your graph, and your graph goes back to how it was. You can also delete paintings from the My paintings page.

**Will the shade come out exactly right?**
Usually. GitHub colors each day relative to your busiest days, so Shadey counts your real commits and works out how many to add. When a day might come out a shade off, it tells you before you paint.

**Why did my painting move?**
The "last 12 months" graph shifts left every week, so a painting there slides off within a year. Paint on a past year instead and it stays.

**Can I keep the repo private?**
Yes. Tick "Private repo". The painting then only shows on your graph if "Private contributions" is turned on in your GitHub profile.

**What does it ask GitHub for?**
Your public profile and permission to create public repos. It asks for more only if you want a private painting.

**Is there a limit?**
Five paintings a day per person.

## Share it

Every painting gets its own page with a preview image, so the link looks good on X, LinkedIn and WhatsApp. You can also download the painting as an image.

## Run your own copy

Setup and deploy steps are in [DEVELOPING.md](DEVELOPING.md).
