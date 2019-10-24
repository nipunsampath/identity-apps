/**
 * Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Overview } from "../components";
import { AuthContext } from "../contexts";
import { resolveUserDisplayName } from "../helpers";
import { InnerPageLayout } from "../layouts";

/**
 * Overview page.
 *
 * @return {JSX.Element}
 */
export const HomePage = (): JSX.Element => {
    const { state } = useContext(AuthContext);
    const { t } = useTranslation();

    return (
        <InnerPageLayout
            pageTitle={ t(
                "views:overviewPage.title",
                { firstName: resolveUserDisplayName(state) }
                ) }
            pageDescription={ t("views:overviewPage.subTitle") }
            pageTitleTextAlign="left"
        >
            <Overview />
        </InnerPageLayout>
    );
};
