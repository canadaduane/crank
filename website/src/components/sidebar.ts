import {t} from "@b9g/crank/template.js";
export interface SidebarProps {
	docs: Array<DocInfo>;
	url: string;
	title: string;
}

export function Sidebar({docs, title, url}: SidebarProps) {
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