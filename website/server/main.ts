import {Children, Element, Raw} from "@b9g/crank/crank.js";
import {t} from "@b9g/crank/template.js";
import {renderer} from "@b9g/crank/html.js";

import fs from "fs-extra";
import type {Stats} from "fs";
import * as path from "path";
import frontmatter from "front-matter";

// TODO: lazily import these?
import "prismjs";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-diff.js";
import "prismjs/components/prism-bash.js";

import {createComponent} from "./marked.js";
import {CodeBlock} from "../shared/prism.js";
import {Page, Link, Script, Storage} from "./esbuild.js";

const rootDirname = new URL("..", import.meta.url).pathname;

interface WalkInfo {
	filename: string;
	info: Stats;
}

async function* walk(dir: string): AsyncGenerator<WalkInfo> {
	const files = await fs.readdir(dir);
	for (let filename of files) {
		filename = path.join(dir, filename);
		const info = await fs.stat(filename);
		if (info.isDirectory()) {
			yield* walk(filename);
		} else if (info.isFile()) {
			yield {filename, info};
		}
	}
}

interface DocInfo {
	attributes: {
		title: string;
		publish: boolean;
		publishDate?: Date;
	};
	url: string;
	filename: string;
	body: string;
}

async function collectDocuments(name: string): Promise<Array<DocInfo>> {
	const root = path.join(rootDirname, "documents");
	let docs: Array<DocInfo> = [];
	for await (const {filename} of walk(name)) {
		if (filename.endsWith(".md")) {
			const md = await fs.readFile(filename, {encoding: "utf8"});
			let {attributes, body} = frontmatter(md) as unknown as DocInfo;
			attributes.publish =
				attributes.publish == null ? true : attributes.publish;
			if (attributes.publishDate != null) {
				attributes.publishDate = new Date(attributes.publishDate);
			}

			const url = path
				.join("/", path.relative(root, filename))
				.replace(/\.md$/, "")
				.replace(/([0-9]+-)+/, "");
			docs.push({url, filename, body, attributes});
		}
	}

	return docs;
}

const storage = new Storage({dirname: rootDirname});

interface RootProps {
	title: string;
	children: Children;
	url: string;
}

// TODO: I wonder if we can do some kind of slot-based or includes API
function Root({title, children, url}: RootProps): Element {
	return t`
		<${Raw} value="<!DOCTYPE html>" />
		<${Page} storage=${storage}>
			<html lang="en">
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width" />
					<title>${title}</title>
					<${Link} rel="stylesheet" type="text/css" href="client/index.css" />
					<link rel="shortcut icon" href="/static/favicon.ico" />
					<script
						async
						src="https://www.googletagmanager.com/gtag/js?id=UA-20910936-4"
					/>
					<script
						innerHTML=${`
							window.dataLayer = window.dataLayer || [];
							function gtag(){dataLayer.push(arguments);}
							gtag('js', new Date());

							gtag('config', 'UA-20910936-4');
						`}
					/>
				</head>
				<body>
					<${Navbar} url=${url} />
					<div class="non-footer">${children}</div>
					<${Script} src="client/index.ts" />
				</body>
			</html>
		<//Page>
	`!;
}

interface NavbarProps {
	url: string;
}

function Navbar({url}: NavbarProps): Element {
	return t`
		<nav id="navbar" class="navbar">
			<div class="navbar-group">
				<div class="navbar-item">
					<a
						class="navbar-title-link ${url === "/" ? "current" : null}"
						href="/"
					>
						<img class="navbar-logo" src="/static/logo.svg" alt="" />
						<span>Crank.js</span>
					</a>
				</div>
				<div class="navbar-item">
					<a
						class=${url.startsWith("/guides") && "current"}
						href="/guides/getting-started"
					>
						Docs
					</a>
				</div>
				<div class="navbar-item">
					<a class=${url.startsWith("/blog") && "current"} href="/blog/">
						Blog
					</a>
				</div>
			</div>
			<div class="navbar-group">
				<div class="navbar-item">
					<a href="https://github.com/bikeshaving/crank">GitHub</a>
				</div>
				<div class="navbar-item">
					<a href="http://npm.im/@bikeshaving/crank">NPM</a>
				</div>
			</div>
		</nav>
	`;
}

interface SidebarProps {
	docs: Array<DocInfo>;
	url: string;
	title: string;
}

function Sidebar({docs, title, url}: SidebarProps): Element {
	const links: Array<Element> = [];
	for (const doc of docs) {
		if (doc.attributes.publish) {
			links.push(t`
				<div class="sidebar-item">
					<a href=${doc.url} class=${doc.url === url ? "current" : ""}>
						${doc.attributes.title}
					</a>
				</div>
			`);
		}
	}

	return t`
		<div id="sidebar" class="sidebar">
			<h3>${title}</h3>
			${links}
		</div>
	`;
}

function Home(): Element {
	// TODO: Move home content to a document.
	return t`
		<${Root} title="Crank.js" url="/">
			<div class="home">
				<header class="hero">
					<h1>Crank.js</h1>
					<h2>The most “Just JavaScript” web framework.</h2>
				</header>
				<div class="hero">Hello world</div>
			</div>
		<//Root>
	`;
}

interface BlogContentProps {
	title: string;
	publishDate?: Date;
	children: Children;
}

function BlogContent({title, publishDate, children}: BlogContentProps) {
	const formattedDate =
		publishDate &&
		publishDate.toLocaleString("en-US", {
			month: "long",
			year: "numeric",
			day: "numeric",
			timeZone: "UTC",
		});
	return t`
		<h1>${title}</h1>
		${formattedDate && t`<p>${formattedDate}</p>`}
		${children}
	`;
}

interface BlogPreviewProps {
	docs: Array<DocInfo>;
}

function BlogPreview({docs}: BlogPreviewProps): Array<Element> {
	return docs.map((doc) => {
		let {body} = doc;
		if (body.match("<!-- endpreview -->")) {
			body = body.split("<!-- endpreview -->")[0];
		} else {
			const lines = body.split(/\r\n|\r|\n/);
			body = "";
			let count = 0;
			for (const line of lines) {
				body += line + "\n";
				if (line.trim()) {
					count++;
				}

				if (count > 2) {
					break;
				}
			}
		}

		const {title, publishDate} = doc.attributes;
		const Body = createComponent(body);
		return t`
			<div class="content">
				<${BlogContent} title=${title} publishDate=${publishDate}>
					<${Body} components=${components} />
				<//BlogContent>
				<div>
					<a href=${doc.url}>Read more…</a>
				</div>
			</div>
		`;
	});
}

interface BlogIndexPageProps {
	docs: Array<DocInfo>;
	url: string;
}

function BlogIndexPage({docs, url}: BlogIndexPageProps): Element {
	return t`
		<${Root} title="Crank.js | Blog" url=${url}>
			<${Sidebar} docs=${docs} url=${url} title="Recent Posts" />
			<main class="main">
				<${BlogPreview} docs=${docs} />
			</main>
		<//Root>
	`;
}

interface BlogPageProps {
	title: string;
	url: string;
	publishDate?: Date;
	docs: Array<DocInfo>;
	children: Children;
}

function BlogPage({
	title,
	docs,
	children,
	publishDate,
	url,
}: BlogPageProps): Element {
	return t`
		<${Root} title="Crank.js | ${title}" url=${url}>
			<${Sidebar} docs=${docs} url=${url} title="Recent Posts" />
			<main class="main">
				<div class="content">
					<${BlogContent} title=${title} publishDate=${publishDate}>
						${children}
					<//BlogContent>
				</div>
			</main>
		<//Root>
	`;
}

interface GuidePageProps {
	title: string;
	url: string;
	docs: Array<DocInfo>;
	children: Children;
}

function GuidePage({title, docs, url, children}: GuidePageProps): Element {
	return t`
		<${Root} title="Crank.js | ${title}" url=${url}>
			<${Sidebar} docs=${docs} url=${url} title="Guides" />
			<main class="main">
				<div class="content">
					<h1>${title}</h1>
					${children}
				</div>
			</main>
		<//Root>
	`;
}

const components = {
	codespan({token}: any) {
		return t`<code class="inline">${token.text}</code>`;
	},

	code({token}: any) {
		const {text: code, lang} = token;
		return t`
			<div class="codeblock" data-code=${code} data-lang=${lang}>
				<${CodeBlock} value=${code} lang=${lang} />
			</div>
		`;
	},
};

(async () => {
	const dist = path.join(rootDirname, "./dist");
	await fs.ensureDir(dist);
	await fs.emptyDir(dist);
	await fs.copy(path.join(rootDirname, "static"), path.join(dist, "static"));
	// HOME
	await fs.writeFile(
		path.join(dist, "index.html"),
		await renderer.render(t`<${Home} />`),
	);

	// GUIDES
	{
		const docs = await collectDocuments(
			path.join(rootDirname, "documents/guides"),
		);
		await Promise.all(
			docs.map(async ({attributes: {title, publish}, url, body}) => {
				if (!publish) {
					return;
				}

				const Body = createComponent(body);
				const filename = path.join(dist, url + ".html");
				await fs.ensureDir(path.dirname(filename));
				return fs.writeFile(
					filename,
					await renderer.render(t`
						<${GuidePage} title=${title} docs=${docs} url=${url}>
							<${Body} components=${components} />
						<//GuidePage>,
					`),
				);
			}),
		);
	}

	// BLOG
	{
		const posts = await collectDocuments(
			path.join(rootDirname, "documents/blog"),
		);
		posts.reverse();

		await fs.ensureDir(path.join(dist, "blog"));
		await fs.writeFile(
			path.join(dist, "blog/index.html"),
			await renderer.render(t`<${BlogIndexPage} docs=${posts} url="/blog" />`),
		);

		await Promise.all(
			posts.map(
				async ({attributes: {title, publish, publishDate}, url, body}) => {
					if (!publish) {
						return;
					}

					const Body = createComponent(body);
					const filename = path.join(dist, url + ".html");
					await fs.ensureDir(path.dirname(filename));
					return fs.writeFile(
						filename,
						await renderer.render(t`
							<${BlogPage}
								title=${title}
								docs=${posts}
								url=${url}
								publishDate=${publishDate}
							>
								<${Body} components=${components} />
							<//BlogPage>,
						`),
					);
				},
			),
		);
	}

	await storage.write(path.join(dist, "static/"));
	storage.clear();
})();
