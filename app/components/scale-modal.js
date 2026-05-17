import Component from '@glimmer/component';
import { inject as service } from '@ember/service';

export default class ScaleModalComponent extends Component {
  @service('sprite-forge') forge;
}
