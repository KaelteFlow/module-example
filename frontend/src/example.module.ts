import {IFrontendModule} from "@kaelteflow/frontend-sdk";
import {ExamplePageComponent} from "./components/ExamplePageComponent";

export class ExternalModule implements IFrontendModule {
    routes = {
        path: '',
        component: ExamplePageComponent,
    };
}