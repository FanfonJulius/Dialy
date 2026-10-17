/** Whether the map's buttons, panels and tab bar show; zooming into the map hides them, zooming out brings them back. */
class MapChromeStore {
	hidden = $state(false);

	hide(): void {
		this.hidden = true;
	}

	show(): void {
		this.hidden = false;
	}
}

export const mapChrome = new MapChromeStore();
