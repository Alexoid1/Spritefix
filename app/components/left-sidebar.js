import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class LeftSidebarComponent extends Component {
  @service('sprite-forge') forge;

  @action
  onZoom(event) {
    this.forge.applyZoom(+event.target.value);
  }
}
